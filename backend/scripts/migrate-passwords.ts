import fs from 'fs';
import path from 'path';
import bcryptjs from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_FILE = path.join(__dirname, '../data/database.json');

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  [key: string]: any;
}

interface Database {
  users: User[];
  [key: string]: any;
}

async function migratePasswords() {
  console.log('🔐 [MIGRATION] Starting password migration...\n');

  try {
    // Read database file
    const dbContent = fs.readFileSync(DATABASE_FILE, 'utf-8');
    const db: Database = JSON.parse(dbContent);

    let migratedCount = 0;
    let skippedCount = 0;

    // Process each user
    for (const user of db.users) {
      if (!user.password) {
        console.log(`⚠️  [SKIP] User "${user.email}" has no password`);
        skippedCount++;
        continue;
      }

      // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, $2x$, or $2y$)
      const isBcryptHash = /^\$2[aby]\$/.test(user.password);

      if (isBcryptHash) {
        console.log(`✅ [SKIP] User "${user.email}" already has bcrypt hash`);
        skippedCount++;
        continue;
      }

      try {
        // Hash the plaintext password
        const salt = await bcryptjs.genSalt(10);
        const hashedPassword = await bcryptjs.hash(user.password, salt);
        user.password = hashedPassword;
        
        console.log(`🔄 [HASH] User "${user.email}" password hashed`);
        console.log(`   Original: ${user.password.substring(0, 10)}...`);
        console.log(`   Hashed:   ${hashedPassword.substring(0, 20)}...\n`);
        
        migratedCount++;
      } catch (error) {
        console.log(`❌ [ERROR] Failed to hash password for "${user.email}":`, (error as Error).message);
      }
    }

    // Write updated database back to file
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 2));

    console.log('\n====================================');
    console.log('✅ [MIGRATION] Complete!');
    console.log('====================================');
    console.log(`📊 Results:`);
    console.log(`   Migrated:  ${migratedCount} users`);
    console.log(`   Skipped:   ${skippedCount} users`);
    console.log(`   Total:     ${db.users.length} users`);
    console.log('\n💾 Database file updated successfully!');
  } catch (error) {
    console.error('❌ [ERROR] Migration failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run migration
migratePasswords();
