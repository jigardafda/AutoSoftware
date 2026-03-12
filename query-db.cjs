const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });
  console.log("Users:", JSON.stringify(users, null, 2));

  const repos = await prisma.repository.findMany({
    select: { id: true, fullName: true, userId: true }
  });
  console.log("Repos:", JSON.stringify(repos, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => {
  console.error(e);
  prisma.$disconnect();
});
