/*
  Warnings:

  - Added the required column `signature` to the `PumpFunSwap` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PumpFunSwap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "solAmount" DECIMAL NOT NULL,
    "tokenAmount" DECIMAL NOT NULL,
    "mint" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "signature" TEXT NOT NULL
);
INSERT INTO "new_PumpFunSwap" ("id", "mint", "solAmount", "tokenAmount", "trader", "type") SELECT "id", "mint", "solAmount", "tokenAmount", "trader", "type" FROM "PumpFunSwap";
DROP TABLE "PumpFunSwap";
ALTER TABLE "new_PumpFunSwap" RENAME TO "PumpFunSwap";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
