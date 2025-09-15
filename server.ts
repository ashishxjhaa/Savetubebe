import express, { Request, Response } from "express";
import cors from "cors";
import ytdl from "ytdl-core";

const app = express();
const PORT = process.env.PORT || 3001;

const FRONTEND_URL = process.env.FRONTEND_URL || "https://savetube.vercel.app";
const allowedOrigins = [FRONTEND_URL];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

// ✅ Fetch video info (GET, like CloudClipper)
app.get("/api/download", async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const info = await ytdl.getInfo(url);
    const formats = ytdl.filterFormats(info.formats, "videoandaudio");

    return res.json({
      success: true,
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails.pop()?.url,
      lengthSeconds: parseInt(info.videoDetails.lengthSeconds),
      formats: formats.map((f) => ({
        itag: f.itag,
        container: f.container,
        qualityLabel: f.qualityLabel || "unknown",
      })),
    });
  } catch (err: any) {
    console.error("GET INFO ERROR:", err.message || err);
    return res
      .status(500)
      .json({ error: "ytdl_error", message: "Failed to fetch video info" });
  }
});

// ✅ Stream video/audio download
app.get("/api/download-video", async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    const itag = req.query.itag as string;

    if (!url || !itag || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const info = await ytdl.getInfo(url);
    const format = info.formats.find((f) => String(f.itag) === itag);
    if (!format) {
      return res.status(400).json({ error: "Format not found" });
    }

    const safeTitle = info.videoDetails.title.replace(/[^\w\s.-]/gi, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}.${format.container || "mp4"}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    ytdl(url, { quality: itag }).pipe(res);
  } catch (err: any) {
    console.error("DOWNLOAD ERROR:", err.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "download_failed" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
