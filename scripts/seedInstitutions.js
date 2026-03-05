require('dotenv').config();
const mongoose = require('mongoose');
const Institution = require('../models/Institution');

const institutions = [
  { name: 'Soqhayisa High School', code: 'SOQ-2024-X7K2', type: 'high_school', province: 'Eastern Cape' },
  { name: 'Muir College',          code: 'MUIR-2024-P3M8', type: 'high_school', province: 'Eastern Cape' },
  { name: 'Wynberg Boys High',     code: 'WBH-2024-R5N4',  type: 'high_school', province: 'Western Cape' },
  { name: 'Khumbulani High School', code: 'KHM-2024-J9L6', type: 'high_school', province: 'Gauteng' },
  { name: 'Hilton College',        code: 'HLT-2024-W2F1',  type: 'college',     province: 'KwaZulu-Natal' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const inst of institutions) {
      const existing = await Institution.findOne({ code: inst.code });
      if (existing) {
        console.log(`  ⏩ "${inst.name}" already exists, skipping.`);
      } else {
        await Institution.create(inst);
        console.log(`  ✅ Created "${inst.name}" (${inst.code})`);
      }
    }

    console.log('\nSeed complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
