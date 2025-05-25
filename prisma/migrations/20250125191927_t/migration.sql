/*
  Warnings:

  - A unique constraint covering the columns `[signature]` on the table `PumpFunSwap` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PumpFunSwap_signature_key" ON "PumpFunSwap"("signature");
