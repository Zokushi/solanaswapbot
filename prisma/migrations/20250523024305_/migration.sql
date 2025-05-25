/*
  Warnings:

  - The primary key for the `Config` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `botId` on the `Config` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `stopLossPercentage` on the `Config` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - The primary key for the `MultiConfig` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `botId` on the `MultiConfig` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `stopLossPercentage` on the `MultiConfig` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - The primary key for the `Tags` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Tags` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - The primary key for the `TargetAmount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `configId` on the `TargetAmount` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `id` on the `TargetAmount` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - The primary key for the `Token` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Token` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - The primary key for the `Transaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `botId` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `id` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `A` on the `_TokenTags` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `B` on the `_TokenTags` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
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
    "stopLossPercentage" BIGINT
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
    "checkInterval" INTEGER
);
INSERT INTO "new_MultiConfig" ("botId", "checkInterval", "initialInputAmount", "initialInputToken", "stopLossPercentage", "targetGainPercentage") SELECT "botId", "checkInterval", "initialInputAmount", "initialInputToken", "stopLossPercentage", "targetGainPercentage" FROM "MultiConfig";
DROP TABLE "MultiConfig";
ALTER TABLE "new_MultiConfig" RENAME TO "MultiConfig";
CREATE TABLE "new_Tags" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "verified" TEXT NOT NULL,
    "unverified" TEXT NOT NULL,
    "lst" TEXT NOT NULL,
    "strict" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "pump" TEXT NOT NULL,
    "clone" TEXT NOT NULL
);
INSERT INTO "new_Tags" ("clone", "community", "id", "lst", "pump", "strict", "unverified", "verified") SELECT "clone", "community", "id", "lst", "pump", "strict", "unverified", "verified" FROM "Tags";
DROP TABLE "Tags";
ALTER TABLE "new_Tags" RENAME TO "Tags";
CREATE TABLE "new_TargetAmount" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "configId" BIGINT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "TargetAmount_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MultiConfig" ("botId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TargetAmount" ("amount", "configId", "id", "tokenAddress") SELECT "amount", "configId", "id", "tokenAddress" FROM "TargetAmount";
DROP TABLE "TargetAmount";
ALTER TABLE "new_TargetAmount" RENAME TO "TargetAmount";
CREATE TABLE "new_Token" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoURI" TEXT
);
INSERT INTO "new_Token" ("address", "decimals", "id", "logoURI", "name", "symbol") SELECT "address", "decimals", "id", "logoURI", "name", "symbol" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE UNIQUE INDEX "Token_address_key" ON "Token"("address");
CREATE TABLE "new_Transaction" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "botId" BIGINT NOT NULL,
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
CREATE TABLE "new__TokenTags" (
    "A" BIGINT NOT NULL,
    "B" BIGINT NOT NULL,
    CONSTRAINT "_TokenTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TokenTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new__TokenTags" ("A", "B") SELECT "A", "B" FROM "_TokenTags";
DROP TABLE "_TokenTags";
ALTER TABLE "new__TokenTags" RENAME TO "_TokenTags";
CREATE UNIQUE INDEX "_TokenTags_AB_unique" ON "_TokenTags"("A", "B");
CREATE INDEX "_TokenTags_B_index" ON "_TokenTags"("B");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
