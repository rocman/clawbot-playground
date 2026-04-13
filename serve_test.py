"""Simple HTTP server with correct MIME types for 3DGS viewer testing"""
import http.server
import os

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.spz': 'application/octet-stream',
        '.ply': 'application/octet-stream',
        '.ksplat': 'application/octet-stream',
        '.gz': 'application/octet-stream',
        '.wasm': 'application/wasm',
    }

os.chdir(r"C:\Users\devops_admin\clawbot-playground-pages\4dgs-research")
print(f"Serving at http://localhost:8888/")
print(f"Working dir: {os.getcwd()}")
server = http.server.HTTPServer(("0.0.0.0", 8888), Handler)
server.serve_forever()
