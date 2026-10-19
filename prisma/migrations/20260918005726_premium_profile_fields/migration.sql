-- CreateEnum
CREATE TYPE "SkinConcern" AS ENUM ('ACNE', 'MANCHAS', 'LINHAS_FINAS', 'POROS', 'VERMELHIDAO', 'OLHEIRAS', 'RESSECAMENTO');

-- CreateEnum
CREATE TYPE "HairConcern" AS ENUM ('FRIZZ', 'QUEDA', 'CASPA', 'OLEOSIDADE', 'PONTAS_DUPLAS', 'VOLUME', 'QUIMICA');

-- CreateEnum
CREATE TYPE "IngredientToAvoid" AS ENUM ('PARABENOS', 'SULFATOS', 'SILICONES', 'ALCOOL', 'FRAGRANCIA', 'OLEO_MINERAL');

-- CreateEnum
CREATE TYPE "SunExposure" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "ScentPreference" AS ENUM ('FLORAL', 'AMADEIRADO', 'CITRICO', 'DOCE', 'FRESCO', 'SEM_PREFERENCIA');

-- CreateEnum
CREATE TYPE "SkinTone" AS ENUM ('CLARO', 'MEDIO', 'MORENO', 'ESCURO');

-- CreateEnum
CREATE TYPE "MakeupCoverage" AS ENUM ('LEVE', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "hairConcerns" "HairConcern"[],
ADD COLUMN     "ingredientsToAvoid" "IngredientToAvoid"[],
ADD COLUMN     "makeupCoverage" "MakeupCoverage",
ADD COLUMN     "scentPreference" "ScentPreference",
ADD COLUMN     "skinConcerns" "SkinConcern"[],
ADD COLUMN     "skinTone" "SkinTone",
ADD COLUMN     "sunExposure" "SunExposure";
