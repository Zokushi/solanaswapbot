-- CreateTable
CREATE TABLE "Token" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoURI" TEXT NOT NULL,
    "dailyVolume" REAL NOT NULL,
    "mintAuthority" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Tags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "verified" TEXT NOT NULL,
    "unverified" TEXT NOT NULL,
    "lst" TEXT NOT NULL,
    "strict" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "pump" TEXT NOT NULL,
    "clone" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TokenTags" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_TokenTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TokenTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_address_key" ON "Token"("address");

-- CreateIndex
CREATE UNIQUE INDEX "_TokenTags_AB_unique" ON "_TokenTags"("A", "B");

-- CreateIndex
CREATE INDEX "_TokenTags_B_index" ON "_TokenTags"("B");
