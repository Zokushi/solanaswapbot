-- CreateTable
CREATE TABLE "Transaction" (
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
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Config" ("botId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "botId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "initialInputToken" TEXT NOT NULL,
    "initialOutputToken" TEXT NOT NULL,
    "initialInputAmount" REAL NOT NULL,
    "firstTradePrice" REAL NOT NULL,
    "targetGainPercentage" REAL NOT NULL,
    "stopLossPercentage" INTEGER
);
