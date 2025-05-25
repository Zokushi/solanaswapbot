-- CreateTable
CREATE TABLE "JupSwap" (
    "signature" TEXT NOT NULL PRIMARY KEY,
    "transferAuthority" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "volumeInUsd" DECIMAL NOT NULL,
    "inAmount" BIGINT NOT NULL,
    "inAmountInDecimal" DECIMAL NOT NULL,
    "inAmountInUsd" DECIMAL NOT NULL,
    "inMint" TEXT NOT NULL,
    "outAmount" BIGINT NOT NULL,
    "outAmountInDecimal" DECIMAL NOT NULL,
    "outAmountInUsd" DECIMAL NOT NULL,
    "outMint" TEXT NOT NULL,
    "exactOutAmount" BIGINT NOT NULL,
    "exactOutAmountInUsd" DECIMAL NOT NULL
);
