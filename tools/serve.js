const http = require("http");
const fs = require("fs");
const path = require("path");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
http
  .createServer((req, res) => {
    const p = path.join(__dirname, "..", decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(8321, () => console.log("http://localhost:8321"));
