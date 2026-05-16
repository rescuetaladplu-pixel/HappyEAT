import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Bell, Play, Volume2 } from "lucide-react";
import {
  playNotificationSound,
  SOUND_OPTIONS,
  VOLUME_OPTIONS,
  type SoundId,
  type VolumeLevel,
} from "@/lib/notification-sounds";

export const Route = createFileRoute("/_app/restaurant/notification-settings")({
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("rest-sound") !== "off";
  });
  const [soundType, setSoundType] = useState<SoundId>(() => {
    if (typeof window === "undefined") return "emergency";
    const saved = localStorage.getItem("rest-sound-type") as SoundId | null;
    return saved && SOUND_OPTIONS.some((s) => s.id === saved) ? saved : "emergency";
  });
  const [volume, setVolume] = useState<VolumeLevel>(() => {
    if (typeof window === "undefined") return "normal";
    const saved = localStorage.getItem("rest-sound-volume") as VolumeLevel | null;
    return saved && VOLUME_OPTIONS.some((v) => v.id === saved) ? saved : "normal";
  });

  function toggleSound(on: boolean) {
    setSoundOn(on);
    localStorage.setItem("rest-sound", on ? "on" : "off");
    if (on) playNotificationSound(soundType, volume);
  }
  function selectSound(id: SoundId) {
    setSoundType(id);
    localStorage.setItem("rest-sound-type", id);
    playNotificationSound(id, volume);
  }
  function selectVolume(v: VolumeLevel) {
    setVolume(v);
    localStorage.setItem("rest-sound-volume", v);
    playNotificationSound(soundType, v);
  }

  return (
    <main className="max-w-2xl mx-auto p-4 pb-24 space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/my-restaurant">
          <ArrowLeft className="h-4 w-4 mr-1" />
          กลับ
        </Link>
      </Button>

      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">ตั้งค่าเสียงแจ้งเตือน</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        เสียงจะดังวนซ้ำทุก 3 วินาที จนกว่าจะกดรับ/ปฏิเสธออเดอร์
      </p>

      <Card className="p-4 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">เปิดเสียงแจ้งเตือน</p>
            <p className="text-xs text-muted-foreground">เล่นเสียงเมื่อมีออเดอร์ใหม่</p>
          </div>
          <Switch checked={soundOn} onCheckedChange={toggleSound} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Volume2 className="h-4 w-4" /> ระดับความดัง
          </p>
          <div className="grid grid-cols-3 gap-2">
            {VOLUME_OPTIONS.map((v) => (
              <Button
                key={v.id}
                type="button"
                size="sm"
                variant={volume === v.id ? "default" : "outline"}
                onClick={() => selectVolume(v.id)}
              >
                {v.label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ดังสุด = ขยายเสียงด้วยตัวบีบสัญญาณ (compressor) เพิ่มเป็น 3 เท่า
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">เลือกเสียง</p>
          <RadioGroup
            value={soundType}
            onValueChange={(v) => selectSound(v as SoundId)}
            className="space-y-2"
          >
            {SOUND_OPTIONS.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2 rounded-md border p-3">
                <RadioGroupItem value={opt.id} id={`snd-${opt.id}`} />
                <Label htmlFor={`snd-${opt.id}`} className="flex-1 cursor-pointer">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    playNotificationSound(opt.id, volume);
                  }}
                >
                  <Play className="h-3 w-3 mr-1" />
                  ฟัง
                </Button>
              </div>
            ))}
          </RadioGroup>
        </div>
      </Card>
    </main>
  );
}
