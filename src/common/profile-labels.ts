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

// ---------------------------------------------------------------------------
// Rótulos em português para DESCREVER o perfil à IA em texto natural.
// (buildProfileText). O banco guarda o enum em inglês/código; a IA lê melhor
// em português correto.
// ---------------------------------------------------------------------------

export const SKIN_TYPE_PT: Record<SkinType, string> = {
  OILY: 'oleosa',
  DRY: 'seca',
  COMBINATION: 'mista',
  SENSITIVE: 'sensível',
}

export const HAIR_TYPE_PT: Record<HairType, string> = {
  STRAIGHT: 'liso',
  WAVY: 'ondulado',
  CURLY: 'cacheado',
  COILY: 'crespo',
}

export const BUDGET_PT: Record<BudgetRange, string> = {
  LOW: 'econômico',
  MEDIUM: 'intermediário',
  HIGH: 'alto',
}

export const AGE_RANGE_PT: Record<AgeRange, string> = {
  TEEN: 'adolescente',
  YOUNG_ADULT: 'jovem adulto',
  ADULT: 'adulto',
  MATURE: 'maduro',
}

export const GENDER_PT: Record<Gender, string> = {
  MALE: 'masculino',
  FEMALE: 'feminino',
  OTHER: 'outro',
  PREFER_NOT_TO_SAY: 'não informado',
}

export const SKIN_CONCERN_PT: Record<SkinConcern, string> = {
  ACNE: 'acne',
  MANCHAS: 'manchas',
  LINHAS_FINAS: 'linhas finas',
  POROS: 'poros dilatados',
  VERMELHIDAO: 'vermelhidão',
  OLHEIRAS: 'olheiras',
  RESSECAMENTO: 'ressecamento',
}

export const HAIR_CONCERN_PT: Record<HairConcern, string> = {
  FRIZZ: 'frizz',
  QUEDA: 'queda',
  CASPA: 'caspa',
  OLEOSIDADE: 'oleosidade',
  PONTAS_DUPLAS: 'pontas duplas',
  VOLUME: 'falta de volume',
  QUIMICA: 'cabelo com química',
}

export const INGREDIENT_PT: Record<IngredientToAvoid, string> = {
  PARABENOS: 'parabenos',
  SULFATOS: 'sulfatos',
  SILICONES: 'silicones',
  ALCOOL: 'álcool',
  FRAGRANCIA: 'fragrância',
  OLEO_MINERAL: 'óleo mineral',
}

export const SUN_EXPOSURE_PT: Record<SunExposure, string> = {
  BAIXA: 'baixa',
  MEDIA: 'média',
  ALTA: 'alta',
}

export const SCENT_PT: Record<ScentPreference, string> = {
  FLORAL: 'floral',
  AMADEIRADO: 'amadeirado',
  CITRICO: 'cítrico',
  DOCE: 'doce',
  FRESCO: 'fresco',
  SEM_PREFERENCIA: 'sem preferência',
}

export const SKIN_TONE_PT: Record<SkinTone, string> = {
  CLARO: 'claro',
  MEDIO: 'médio',
  MORENO: 'moreno',
  ESCURO: 'escuro',
}

export const MAKEUP_COVERAGE_PT: Record<MakeupCoverage, string> = {
  LEVE: 'leve',
  MEDIA: 'média',
  ALTA: 'alta',
}

// ---------------------------------------------------------------------------
// Qualificadores para a QUERY de busca no Google Shopping.
// Aqui o termo é o que as LOJAS usam ("anticaspa", não "caspa").
// ---------------------------------------------------------------------------

export const HAIR_CONCERN_SEARCH: Record<HairConcern, string> = {
  FRIZZ: 'antifrizz',
  QUEDA: 'antiqueda',
  CASPA: 'anticaspa',
  OLEOSIDADE: 'controle de oleosidade',
  PONTAS_DUPLAS: 'reparação de pontas',
  VOLUME: 'volume',
  QUIMICA: 'cabelo com química',
}

export const SKIN_CONCERN_SEARCH: Record<SkinConcern, string> = {
  ACNE: 'antiacne',
  MANCHAS: 'clareador de manchas',
  LINHAS_FINAS: 'antissinais',
  POROS: 'redutor de poros',
  VERMELHIDAO: 'calmante',
  OLHEIRAS: 'para olheiras',
  RESSECAMENTO: 'hidratante',
}
