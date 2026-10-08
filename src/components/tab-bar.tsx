// The bar along the bottom of each side of the app, drawn as the designs draw it.
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, f } from "@/lib/theme";
import { Icon, type IconName } from "./ui";

export type TabSpec = { name: string; label: string; icon: IconName; badge?: number };

// The navigator hands these in; only what the bar needs is typed.
type BarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
};

export function makeTabBar(tabs: TabSpec[]) {
  return function TabBar({ state, navigation }: BarProps) {
    const insets = useSafeAreaInsets();
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: 10, paddingHorizontal: 6, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream }}>
        {tabs.map((spec) => {
          // In the order the design gives, whatever order the navigator found the files in.
          const i = state.routes.findIndex((r) => r.name === spec.name);
          if (i < 0) return null;
          const route = state.routes[i];
          const on = state.index === i;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={spec.label}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!on && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ minWidth: 60, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 4 }}>
              <View>
                <Icon name={spec.icon} size={22} color={on ? c.ink : c.tab} stroke={on ? 2.2 : 2} />
                {spec.badge ? <View style={{ position: "absolute", top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.wine, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ fontFamily: f.bold, fontSize: 10, color: c.white }}>{spec.badge > 99 ? "99+" : spec.badge}</Text></View> : null}
              </View>
              <Text style={{ fontFamily: f.semi, fontSize: 10, color: on ? c.ink : c.tab }}>{spec.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };
}
