-- CreateTable
CREATE TABLE "ParsedTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "blockTime" DATETIME,
    "slot" BIGINT NOT NULL,
    "blockhash" TEXT,
    "fee" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "Participant_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ParsedTransaction" ("transactionId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "decimals" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    CONSTRAINT "TokenTransfer_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ParsedTransaction" ("transactionId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "logMessage" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "LogMessage_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ParsedTransaction" ("transactionId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramId" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    CONSTRAINT "ProgramId_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ParsedTransaction" ("transactionId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ParsedTransaction_transactionId_key" ON "ParsedTransaction"("transactionId");
