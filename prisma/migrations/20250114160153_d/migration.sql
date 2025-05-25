/*
  Warnings:

  - A unique constraint covering the columns `[signature]` on the table `JupSwap` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "JupSwap_signature_key" ON "JupSwap"("signature");
