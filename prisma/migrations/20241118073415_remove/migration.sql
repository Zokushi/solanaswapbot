-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "botId" INTEGER NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenInAmount" REAL NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "tokenOutAmount" REAL NOT NULL,
    "tokenInUSD" REAL NOT NULL,
    "tokenOutUSD" REAL NOT NULL,
    "totalValueUSD" REAL NOT NULL,
    "txid" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Transaction" ("botId", "date", "id", "tokenIn", "tokenInAmount", "tokenInUSD", "tokenOut", "tokenOutAmount", "tokenOutUSD", "totalValueUSD", "txid") SELECT "botId", "date", "id", "tokenIn", "tokenInAmount", "tokenInUSD", "tokenOut", "tokenOutAmount", "tokenOutUSD", "totalValueUSD", "txid" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
