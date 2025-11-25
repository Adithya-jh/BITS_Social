-- CreateEnum
CREATE TYPE "Campus" AS ENUM ('PILANI', 'GOA', 'HYDERABAD', 'DUBAI');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "campus" "Campus";
