import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { parseAndCleanBlinkitRows } from "./parser";
import { commitUploadTransaction, getDataAdapterStatus } from "./data-layer";
import { getNotificationDispatcher } from "./notifications/notifier";
import { loadStore } from "./db";

export async function runSeed(filePath?: string) {
  const targetPath =
    filePath ||
    path.join(process.cwd(), "sample-data", "bulk_po_csv-3672559.csv");

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Seed file not found at: ${targetPath}`);
  }

  const adapterStatus = await getDataAdapterStatus();
  console.log(`\n🌱 Loading sample data from: ${targetPath}`);
  console.log(`📡 Target Data Layer: ${adapterStatus.adapter} (fallback: ${adapterStatus.isFallback})`);

  const csvContent = fs.readFileSync(targetPath, "utf-8");

  const parseResult = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  console.log(`Parsed ${parseResult.data.length} raw CSV rows.`);

  const { validRows, rejectedRows } = parseAndCleanBlinkitRows(parseResult.data);
  console.log(`Validation results: ${validRows.length} valid rows, ${rejectedRows.length} rejected rows.`);

  const { uploadId, preview } = await commitUploadTransaction(
    validRows,
    path.basename(targetPath),
    "seed_script"
  );

  console.log("\n📊 Seed Summary:");
  console.log(`  Upload ID:       ${uploadId}`);
  console.log(`  Total POs:       ${preview.pos_total}`);
  console.log(`  New POs:         ${preview.pos_new}`);
  console.log(`  Updated POs:     ${preview.pos_updated}`);
  console.log(`  Unchanged POs:   ${preview.pos_unchanged}`);
  console.log(`  Near Expiry POs: ${preview.pos_near_expiry}`);
  console.log(`  Total Units:     ${preview.total_units.toLocaleString()}`);
  console.log(`  Total Amount:    ₹${preview.total_amount.toLocaleString("en-IN")}`);

  // Note: Stock in hand starts empty (0 mock stock). Uploaded via Inventory / Stock UI.

  // Trigger notification dispatcher
  if (preview.pos_new > 0) {
    const store = loadStore();
    const dispatcher = getNotificationDispatcher();
    await dispatcher.notifyUploadSuccess(preview, store);
  }

  console.log("✅ Seed completed successfully!\n");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  runSeed().catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
}
