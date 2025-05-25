/*
  Warnings:

  - You are about to drop the column `dailyVolume` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the column `mintAuthority` on the `Token` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Token" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoURI" TEXT NOT NULL
);
INSERT INTO "new_Token" ("address", "decimals", "id", "logoURI", "name", "symbol") SELECT "address", "decimals", "id", "logoURI", "name", "symbol" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE UNIQUE INDEX "Token_address_key" ON "Token"("address");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
