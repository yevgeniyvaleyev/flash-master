import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { validIcon } from '@/logic/topic-icons';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Every icon name of the font (search and validation). */
export const ICON_NAMES = Object.keys(MaterialCommunityIcons.glyphMap) as IconName[];
const ICON_SET: ReadonlySet<string> = new Set(ICON_NAMES);

/** A topic's mark: its icon in its color, or a color dot without one (or with a name the font doesn't have). */
export function TopicMark({
  color,
  icon,
  size = 12,
  dim = false,
}: {
  color: string;
  icon: string | null | undefined;
  /** Dot diameter; the icon is drawn a bit larger so both read the same. */
  size?: number;
  dim?: boolean;
}) {
  const name = validIcon(icon, ICON_SET);
  const opacity = dim ? 0.5 : 1;
  if (name) {
    return (
      <MaterialCommunityIcons name={name as IconName} size={Math.round(size * 1.6)} color={color} style={{ opacity }} />
    );
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }} />;
}
