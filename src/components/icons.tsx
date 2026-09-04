// ============ Shared category icons ============
// One source of truth for the monochrome stop/suggestion icon set: map pins,
// nearby-suggestion thumbnails and any future surface that needs a clean
// category glyph. Lucide components inherit currentColor so parents set the colour.
import type { ReactNode } from 'react'
import {
  BedDouble, Building, Calendar, Camera, Coffee, Landmark, Leaf,
  Mountain, ShoppingBag, TrainFront, Umbrella, Utensils,
  type LucideIcon,
} from 'lucide-react'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  hotel: BedDouble,
  rest: Coffee,
  temple: Landmark,
  beach: Umbrella,
  nature: Leaf,
  adventure: Mountain,
  shopping: ShoppingBag,
  museum: Building,
  travel: TrainFront,
  'transport-hub': TrainFront,
  event: Calendar,
}

export function CatIcon({ category, size = 15, className }: {
  category?: string; size?: number; className?: string
}): ReactNode {
  const Icon = CATEGORY_ICONS[category ?? ''] ?? Camera
  return (
    <Icon size={size} className={className} strokeWidth={2} aria-hidden />
  )
}
