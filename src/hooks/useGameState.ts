import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getRoomState, type RoomState } from "@/lib/game.functions";

export function useGameState(code: string, playerId?: string) {
  const fetchState = useServerFn(getRoomState);

  const query = useQuery<RoomState>({
    queryKey: ["room", code, playerId ?? "host"],
    queryFn: () => fetchState({ data: { code, playerId } }),
    refetchInterval: 400,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    retry: 5,
    retryDelay: 300,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`room-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
        void query.refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void query.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return query;
}
