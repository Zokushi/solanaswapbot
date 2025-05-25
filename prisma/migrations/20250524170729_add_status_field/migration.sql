-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Config" (
    "botId" BIGINT NOT NULL PRIMARY KEY,
    "initialInputToken" TEXT NOT NULL,
    "initialOutputToken" TEXT NOT NULL,
    "initialInputAmount" REAL NOT NULL,
    "firstTradePrice" REAL NOT NULL,
    "targetGainPercentage" REAL NOT NULL,
    "stopLossPercentage" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'inactive'
);
INSERT INTO "new_Config" ("botId", "firstTradePrice", "initialInputAmount", "initialInputToken", "initialOutputToken", "stopLossPercentage", "targetGainPercentage") SELECT "botId", "firstTradePrice", "initialInputAmount", "initialInputToken", "initialOutputToken", "stopLossPercentage", "targetGainPercentage" FROM "Config";
DROP TABLE "Config";
ALTER TABLE "new_Config" RENAME TO "Config";
CREATE TABLE "new_MultiConfig" (
    "botId" BIGINT NOT NULL PRIMARY KEY,
    "initialInputToken" TEXT NOT NULL,
    "initialInputAmount" REAL NOT NULL,
    "targetGainPercentage" REAL NOT NULL,
    "stopLossPercentage" BIGINT,
    "checkInterval" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'inactive'
);
INSERT INTO "new_MultiConfig" ("botId", "checkInterval", "initialInputAmount", "initialInputToken", "stopLossPercentage", "targetGainPercentage") SELECT "botId", "checkInterval", "initialInputAmount", "initialInputToken", "stopLossPercentage", "targetGainPercentage" FROM "MultiConfig";
DROP TABLE "MultiConfig";
ALTER TABLE "new_MultiConfig" RENAME TO "MultiConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
