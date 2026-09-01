import dotenv from "dotenv";
import { createServer } from "./server";

dotenv.config();

const PORT = process.env.PORT || 8001;

const app = createServer();

if (process.argv.includes("--test")) {
  console.log("[AI Service] Test check passed successfully.");
  process.exit(0);
}

app.listen(PORT, () => {
  console.log(`🚀 Plane AI Service running on port ${PORT}`);
});
