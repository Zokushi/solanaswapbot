/*
  Warnings:

  - You are about to drop the `DriftPositions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JupSwap` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LogMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParsedTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Participant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PerpetualPosition` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProgramId` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PumpFunSwap` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TokenTransfer` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DriftPositions";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "JupSwap";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LogMessage";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ParsedTransaction";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Participant";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PerpetualPosition";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProgramId";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PumpFunSwap";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TokenTransfer";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MultiConfig" (
    "botId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "initialInputToken" TEXT NOT NULL,
    "initialInputAmount" REAL NOT NULL,
    "targetGainPercentage" REAL NOT NULL,
    "stopLossPercentage" INTEGER,
    "checkInterval" INTEGER
);

-- CreateTable
CREATE TABLE "TargetAmount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "configId" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "TargetAmount_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MultiConfig" ("botId") ON DELETE CASCADE ON UPDATE CASCADE
);
