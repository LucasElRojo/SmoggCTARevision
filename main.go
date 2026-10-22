// CTA Checker: compares a Discord CTA sign-up list with the weapons each
// player really used in an Albion Online battle, read from the public
// gameinfo API. It serves a local page on 127.0.0.1 and opens the browser;
// the server exists only because the API sends no CORS headers.
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"sync"
	"time"
)

//go:embed web
var webFiles embed.FS

var regions = map[string]string{
	"west":   "https://gameinfo.albiononline.com/api/gameinfo/",
	"east":   "https://gameinfo-sgp.albiononline.com/api/gameinfo/",
	"europe": "https://gameinfo-ams.albiononline.com/api/gameinfo/",
}

// Only the read endpoints the page needs; the proxy is not an open relay.
var allowedPath = regexp.MustCompile(`^(battles|battles/\d+|events/battle/\d+|search|guilds/[\w-]+|players/[\w-]+)$`)

var client = &http.Client{Timeout: 40 * time.Second}

func main() {
	static, _ := fs.Sub(webFiles, "web")
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(static)))
	mux.HandleFunc("/api/gi/", proxy)
	mux.HandleFunc("/api/config", jsonFileHandler("cta-checker-config.json", false))
	mux.HandleFunc("/api/history", jsonFileHandler("cta-checker-history.json", true))

	listener, err := net.Listen("tcp", "127.0.0.1:8765")
	if err != nil {
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			log.Fatal(err)
		}
	}
	url := "http://" + listener.Addr().String() + "/"
	fmt.Println("CTA Checker abierto en", url)
	fmt.Println("Deja esta ventana abierta mientras lo usas; ciérrala para salir.")
	go openBrowser(url)
	log.Fatal(http.Serve(listener, mux))
}

// proxy forwards /api/gi/<path>?region=west&... to the gameinfo API, retrying
// the 5xx answers and timeouts the API gives often.
func proxy(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path[len("/api/gi/"):]
	if !allowedPath.MatchString(path) {
		http.Error(w, "ruta no permitida", http.StatusBadRequest)
		return
	}
	query := r.URL.Query()
	base, ok := regions[query.Get("region")]
	if !ok {
		base = regions["west"]
	}
	query.Del("region")
	target := base + path
	if encoded := query.Encode(); encoded != "" {
		target += "?" + encoded
	}

	var lastErr string
	for attempt := 0; attempt < 4; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 1500 * time.Millisecond)
		}
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
		req.Header.Set("User-Agent", "CTA-Checker/1.0")
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err.Error()
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil || resp.StatusCode >= 500 {
			lastErr = fmt.Sprintf("HTTP %d", resp.StatusCode)
			continue
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
	http.Error(w, "la API de Albion no respondió: "+lastErr, http.StatusBadGateway)
}

var filesMu sync.Mutex

// dataPath keeps the user's files beside the executable, so they travel with
// it to another PC.
func dataPath(name string) string {
	exe, err := os.Executable()
	if err != nil {
		return name
	}
	return filepath.Join(filepath.Dir(exe), name)
}

// jsonFileHandler serves one JSON file: GET reads it ({} when missing), POST
// replaces it. With backup, the previous version is first copied to
// backups/<name>-<timestamp>.json: the attendance history is the guild's
// record and a bad save must never lose it.
func jsonFileHandler(name string, backup bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filesMu.Lock()
		defer filesMu.Unlock()
		path := dataPath(name)
		switch r.Method {
		case http.MethodGet:
			data, err := os.ReadFile(path)
			if err != nil {
				data = []byte("{}")
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(data)
		case http.MethodPost:
			body, err := io.ReadAll(io.LimitReader(r.Body, 64<<20))
			if err != nil || !json.Valid(body) {
				http.Error(w, "JSON inválido", http.StatusBadRequest)
				return
			}
			if backup {
				if old, err := os.ReadFile(path); err == nil {
					dir := dataPath("backups")
					os.MkdirAll(dir, 0o755)
					stamp := time.Now().Format("20060102-150405")
					base := name[:len(name)-len(filepath.Ext(name))]
					if err := os.WriteFile(filepath.Join(dir, base+"-"+stamp+".json"), old, 0o644); err != nil {
						http.Error(w, "no pude respaldar: "+err.Error(), http.StatusInternalServerError)
						return
					}
					pruneBackups(dir, base+"-", 100)
				}
			}
			tmp := path + ".tmp"
			if err := os.WriteFile(tmp, body, 0o644); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if err := os.Rename(tmp, path); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "método no permitido", http.StatusMethodNotAllowed)
		}
	}
}

// pruneBackups keeps the newest `keep` automatic copies; their timestamped
// names sort chronologically.
func pruneBackups(dir, prefix string, keep int) {
	matches, _ := filepath.Glob(filepath.Join(dir, prefix+"*.json"))
	sort.Strings(matches)
	for len(matches) > keep {
		os.Remove(matches[0])
		matches = matches[1:]
	}
}

func openBrowser(url string) {
	time.Sleep(300 * time.Millisecond)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Abre esta dirección en tu navegador:", url)
	}
}
