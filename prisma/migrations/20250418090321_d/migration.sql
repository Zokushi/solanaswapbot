-- CreateTable
CREATE TABLE "PerpetualPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "createdTime" INTEGER NOT NULL,
    "updatedTime" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PerpetualPosition_txHash_key" ON "PerpetualPosition"("txHash");
