/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { PrismaClient } = require("../src/generated/prisma") as {
  PrismaClient: new () => any;
};

const prisma = new PrismaClient();

async function main() {
  const tenantA = await prisma.tenantApotek.upsert({
    where: { code: "ASM" },
    update: {},
    create: { name: "Apotek Sehat Medika", code: "ASM" },
  });

  const tenantB = await prisma.tenantApotek.upsert({
    where: { code: "AKF" },
    update: {},
    create: { name: "Apotek Keluarga Farma", code: "AKF" },
  });

  const roleEntries = [
    { name: "super_admin_bba", description: "Kontrol lintas tenant" },
    { name: "crew", description: "Input data operasional" },
    { name: "admin_apotek", description: "Approval operasional" },
    { name: "owner", description: "Monitoring KPI" },
  ];

  for (const role of roleEntries) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  await prisma.workforceRequest.createMany({
    data: [
      {
        tenantId: tenantA.id,
        positionTitle: "Apoteker Pendamping",
        headcountNeeded: 1,
        priorityLevel: "high",
        targetJoinDate: new Date("2026-05-20"),
        status: "submitted",
      },
      {
        tenantId: tenantB.id,
        positionTitle: "Admin Gudang",
        headcountNeeded: 2,
        priorityLevel: "medium",
        targetJoinDate: new Date("2026-05-30"),
        status: "approved",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.candidate.createMany({
    data: [
      {
        tenantId: tenantA.id,
        fullName: "Nadia Putri",
        appliedPosition: "Apoteker Pendamping",
        sourceChannel: "Instagram",
        status: "interview_scheduled",
      },
      {
        tenantId: tenantB.id,
        fullName: "Rizky Maulana",
        appliedPosition: "Admin Gudang",
        sourceChannel: "Referral",
        status: "screening_passed",
      },
      {
        tenantId: tenantA.id,
        fullName: "Sinta Ayu",
        appliedPosition: "Apoteker Pendamping",
        sourceChannel: "Job Portal",
        status: "hired",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.task.createMany({
    data: [
      {
        tenantId: tenantA.id,
        title: "Validasi CV Kandidat Apoteker",
        assignee: "Crew - Andi",
        dueDate: new Date("2026-04-30"),
        status: "submitted",
      },
      {
        tenantId: tenantB.id,
        title: "Final Interview Admin Gudang",
        assignee: "Admin Apotek - Rina",
        dueDate: new Date("2026-05-01"),
        status: "in_progress",
      },
      {
        tenantId: tenantA.id,
        title: "Input Data Karyawan Baru",
        assignee: "Crew - Putra",
        dueDate: new Date("2026-04-29"),
        status: "approved",
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
