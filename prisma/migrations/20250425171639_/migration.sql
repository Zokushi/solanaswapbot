/*
  Warnings:

  - You are about to alter the column `createdTime` on the `PerpetualPosition` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `updatedTime` on the `PerpetualPosition` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PerpetualPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "collateralUsdDelta" REAL NOT NULL,
    "price" REAL NOT NULL,
    "size" REAL NOT NULL,
    "fee" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdTime" BIGINT NOT NULL,
    "updatedTime" BIGINT NOT NULL
);
INSERT INTO "new_PerpetualPosition" ("action", "collateralUsdDelta", "createdTime", "fee", "id", "mint", "orderType", "pnl", "positionName", "price", "side", "size", "txHash", "updatedTime", "user") SELECT "action", "collateralUsdDelta", "createdTime", "fee", "id", "mint", "orderType", "pnl", "positionName", "price", "side", "size", "txHash", "updatedTime", "user" FROM "PerpetualPosition";
DROP TABLE "PerpetualPosition";
ALTER TABLE "new_PerpetualPosition" RENAME TO "PerpetualPosition";
CREATE UNIQUE INDEX "PerpetualPosition_txHash_key" ON "PerpetualPosition"("txHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
