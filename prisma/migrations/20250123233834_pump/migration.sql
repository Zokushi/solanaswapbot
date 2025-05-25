-- CreateTable
CREATE TABLE "PumpFunSwap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "solAmount" DECIMAL NOT NULL,
    "tokenAmount" DECIMAL NOT NULL,
    "mint" TEXT NOT NULL,
    "trader" TEXT NOT NULL
);
