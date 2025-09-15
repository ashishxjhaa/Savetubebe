import express, { Request, Response } from "express";
import cors from "cors";
import youtubedl from "youtube-dl-exec";

const app = express();
const PORT = process.env.PORT || 3001;

const FRONTEND_URL = process.env.FRONTEND_URL || "https://savetube.vercel.app";
const allowedOrigins = [FRONTEND_URL];

app.use(express.json());
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);


app.post("/api/download", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || !url.trim())
      return res.status(400).json({ error: "URL is required" });

    const info: any = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      addHeader: ["referer:youtube.com", "user-agent:googlebot"],
    });

    const title = info.title || "video";
    const thumbnail =
      info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1] || null;
    const lengthSeconds =
      parseInt(info.duration, 10) ||
      (info.duration ? Math.floor(info.duration) : 0);

    const formats = (info.formats || [])
      .filter(
        (f: any) =>
          (f.height && f.height > 0) || (f.vcodec && f.vcodec !== "none")
      )
      .map((f: any) => ({
        itag:
          f.format_id?.toString() ??
          String(f.format_id ?? f.itag ?? ""),
        container: f.ext || f.format || "mp4",
        qualityLabel:
          f.height ? `${f.height}p` : f.format_note || f.format || "unknown",
      }));

    if (!formats.length)
      return res
        .status(400)
        .json({ error: "No downloadable video formats found" });

    return res.json({
      success: true,
      title,
      thumbnail,
      lengthSeconds,
      formats,
    });
  } catch (err: any) {
    console.error("GET INFO ERROR:", err?.message || err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});


app.get("/api/download-video", async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    const itag = String(req.query.itag || "");

    if (!url || !itag)
      return res.status(400).json({ error: "Missing parameters" });

    const info: any = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
    });

    const chosen = (info.formats || []).find(
      (f: any) => String(f.format_id) === itag
    );
    const ext = chosen?.ext || "mp4";
    const safeTitle = (info.title || "video").replace(/[^\w\s.-]/gi, "_");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}.${ext}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    const subprocess = (youtubedl as any).raw(url, {
      format: itag,
      output: "-",
    });

    subprocess.stdout.pipe(res);

    subprocess.stderr.on("data", (d: Buffer) => {
      console.error("yt-dlp:", d.toString());
    });

    subprocess.on("error", (err: Error) => {
      console.error("yt-dlp process error", err);
      if (!res.headersSent) res.status(500).end();
    });

    subprocess.on("close", () => {
      if (!res.writableEnded) res.end();
    });
  } catch (err: any) {
    console.error("DOWNLOAD ERROR:", err?.message || err);
    if (!res.headersSent)
      return res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
