import prisma from "../utils/prismaClient.js";

export async function getTradeLogs() {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: {
        date: "desc",
      },  
    });
    if (!transactions) {
      throw new Error("No transactions found");
    }
    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
  } finally {
    await prisma.$disconnect();
  }
}


