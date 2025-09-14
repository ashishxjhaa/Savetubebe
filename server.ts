import express from "express";
import cors from "cors";
import ytdl from "ytdl-core";

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = ["https://savetube.vercel.app"];

app.use(express.json());

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true
}));

app.post("/api/download", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim())
      return res.status(400).json({ error: "URL is required" });

    const isValidYoutube =
      url.includes("youtube.com") || url.includes("youtu.be");
    if (!isValidYoutube)
      return res.status(400).json({ error: "Invalid YouTube link" });

    let videoUrl = url;
    if (url.includes("youtu.be")) {
      const videoId = url.split("/").pop();
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    const info = await ytdl.getInfo(videoUrl, {
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept-Language": "en-US,en;q=0.9"
        }
      }
    });

    const { title, thumbnails, lengthSeconds } = info.videoDetails;
    const thumbnailUrl = thumbnails[thumbnails.length - 1].url;
    const formats = info.formats
      .filter(f => f.hasVideo)
      .map(f => ({
        itag: f.itag,
        container: f.container,
        qualityLabel: f.qualityLabel || "unknown",
      }));
    if (!formats.length)
      return res.status(400).json({ error: "No downloadable video formats found" });

    res.json({
      success: true,
      title,
      thumbnail: thumbnailUrl,
      lengthSeconds: parseInt(lengthSeconds, 10),
      formats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/download-video", async (req, res) => {
  const url = req.query.url as string;
  const itag = parseInt(req.query.itag as string);

  if (!url || !itag) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  try {
    const info = await ytdl.getInfo(url);
    if (!info?.formats) throw new Error("No formats found");
    const format = info.formats.find(f => f.itag === itag);
    if (!format) {
      return res.status(400).json({ error: "Format not found" });
    }
    const title =
      info.videoDetails?.title?.replace(/[^\w\s.-]/gi, "_") || "video";
    const ext = format.container || "mp4";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title}.${ext}"`
    );
    res.setHeader("Content-Type", "video/mp4");
    ytdl.downloadFromInfo(info, { format }).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});