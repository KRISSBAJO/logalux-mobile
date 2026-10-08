// Time off: requests and approved days from the last two weeks onwards. A manager adds, approves (and can
// move the bookings to others), declines and removes; a team member asks for their own and sees the answer.
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, SmallBtn, Wait } from "@/components/mc-kit";
import { OffCard } from "@/components/me-kit";
import { TimeOffSheet, useOffActions } from "@/components/me-sheets";
import { Btn, Chip, Empty, Failed, Note, T } from "@/components/ui";
import { isRenter, useTeam } from "@/lib/me-staff";
import { c, pad } from "@/lib/theme";

type Filter = "all" | "requested" | "approved" | "declined" | "mine";

export default function TimeOff() {
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, refresh, reload, s, today, manager, mine } = useTeam();
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const off = useOffActions((text, kind = "ok") => { setNote({ kind, text }); void refresh(); void s.refresh(); });

  const all = useMemo(() => data?.time_off ?? [], [data]);
  const shown = useMemo(() => all.filter((o) => filter === "all" || (filter === "mine" ? o.staff_id === mine : o.status === filter)), [all, filter, mine]);
  const workers = (data?.staff ?? []).filter((p) => !p.archived && !isRenter(p));
  const count = (k: string) => all.filter((o) => o.status === k).length;
  const mayAdd = (manager || !!mine) && workers.length > 0;

  const top = { paddingTop: insets.top + 12, paddingHorizontal: pad } as const;
  if (!data) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.cream }, top]}>
        <Header title="Time off" />
        {error ? <View style={{ marginTop: 16 }}><Failed error={error} onRetry={reload} /></View> : <Wait />}
      </View>
    );
  }

  const header = (
    <View style={{ marginBottom: 12 }}>
      <Header title="Time off" right={mayAdd ? <SmallBtn kind="ink" icon="plus" onPress={() => setOpen(true)}>{manager ? "Add" : "Ask"}</SmallBtn> : undefined} />
      {all.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -pad }} contentContainerStyle={{ gap: 8, paddingHorizontal: pad }}>
          <Chip on={filter === "all"} onPress={() => setFilter("all")}>All · {all.length}</Chip>
          {!manager && mine ? <Chip on={filter === "mine"} onPress={() => setFilter("mine")}>Yours · {all.filter((o) => o.staff_id === mine).length}</Chip> : null}
          <Chip on={filter === "requested"} onPress={() => setFilter("requested")}>Requested · {count("requested")}</Chip>
          <Chip on={filter === "approved"} onPress={() => setFilter("approved")}>Approved · {count("approved")}</Chip>
          {count("declined") ? <Chip on={filter === "declined"} onPress={() => setFilter("declined")}>Declined · {count("declined")}</Chip> : null}
        </ScrollView>
      ) : null}
      {note ? <View style={{ marginTop: 12 }}><Note kind={note.kind}>{note.text}</Note></View> : null}
      {!manager && !mine ? <View style={{ marginTop: 12 }}><Note kind="gold">Your sign-in is not linked to a person on the roster, so you cannot ask for time off here. Ask the owner to invite you from your own page.</Note></View> : null}
      {!all.length ? (
        <View style={{ marginTop: 16 }}>
          <Empty title="No time off" action={mayAdd ? <Btn small onPress={() => setOpen(true)} style={{ marginTop: 4 }}>{manager ? "Add time off" : "Ask for time off"}</Btn> : undefined}>Requests and approved days from the last two weeks onwards show here.</Empty>
        </View>
      ) : !shown.length ? <View style={{ marginTop: 16 }}><Empty title="Nothing here">Nothing matches that choice. Choose All to see every entry.</Empty></View> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <FlatList
        data={shown}
        keyExtractor={(o) => String(o.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...top, paddingBottom: Math.max(insets.bottom, 14) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.wine} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListFooterComponent={all.length ? <T size={12} muted style={{ marginTop: 12 }}>Approved days cannot be booked online or from the calendar. Bookings made before the approval stay until someone moves them. &quot;Approve and reassign&quot; moves them to others who do the same services and are free.</T> : null}
        renderItem={({ item: o }) => <OffCard o={o} manager={manager} mine={o.staff_id === mine} busy={off.busy === o.id} onDo={off.act} />}
      />
      <TimeOffSheet open={open} onClose={() => setOpen(false)} people={workers} staffId={manager ? String(workers[0]?.id ?? "") : mine} manager={manager} today={today}
        onSaved={(text) => { setOpen(false); setNote({ kind: "ok", text }); void refresh(); void s.refresh(); }} />
    </View>
  );
}
