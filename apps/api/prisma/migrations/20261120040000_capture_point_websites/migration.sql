-- Capture points: websites that may post to the public capture endpoint from a browser (empty = any).
ALTER TABLE "CapturePoint" ADD COLUMN "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];
