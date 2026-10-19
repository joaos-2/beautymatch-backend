import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator'

import {
  SkinType,
  HairType,
  BudgetRange,
  AgeRange,
  Gender,
  SkinConcern,
  HairConcern,
  IngredientToAvoid,
  SunExposure,
  ScentPreference,
  SkinTone,
  MakeupCoverage,
} from '@prisma/client'

export class CreateProfileDto {
  @IsOptional()
  @IsEnum(SkinType)
  skinType?: SkinType

  @IsOptional()
  @IsEnum(HairType)
  hairType?: HairType

  @IsOptional()
  @IsEnum(BudgetRange)
  budget?: BudgetRange

  @IsOptional()
  @IsEnum(AgeRange)
  ageRange?: AgeRange

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender

  @IsOptional()
  @IsBoolean()
  sensitiveSkin?: boolean

  @IsOptional()
  @IsBoolean()
  veganOnly?: boolean

  // --- Campos premium ---

  @IsOptional()
  @IsArray()
  @IsEnum(SkinConcern, { each: true })
  skinConcerns?: SkinConcern[]

  @IsOptional()
  @IsArray()
  @IsEnum(HairConcern, { each: true })
  hairConcerns?: HairConcern[]

  @IsOptional()
  @IsArray()
  @IsEnum(IngredientToAvoid, { each: true })
  ingredientsToAvoid?: IngredientToAvoid[]

  @IsOptional()
  @IsEnum(SunExposure)
  sunExposure?: SunExposure

  @IsOptional()
  @IsEnum(ScentPreference)
  scentPreference?: ScentPreference

  @IsOptional()
  @IsEnum(SkinTone)
  skinTone?: SkinTone

  @IsOptional()
  @IsEnum(MakeupCoverage)
  makeupCoverage?: MakeupCoverage
}