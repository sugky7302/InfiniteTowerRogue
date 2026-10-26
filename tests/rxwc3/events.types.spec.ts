import { DamageEvent, onDamaged, onDamaging, onSpellChannel, UnitHandle } from "../../src/shared/rxwc3";

// 僅供型別檢查，不由 Node 載入。
function checkEvents(unit: UnitHandle, wrapped: { readonly handle: UnitHandle }, event: DamageEvent): void {
  onSpellChannel.of(unit); onSpellChannel.of(wrapped);
  onDamaged.ofTarget(wrapped); onDamaging.ofSource(unit);
  // @ts-expect-error 傷害後事件沒有傷害量修改方法。
  event.setAmount(1);
  // @ts-expect-error 傷害後事件沒有攻擊類型修改方法。
  event.setAttackType(event.attackType);
  // @ts-expect-error 傷害後事件沒有傷害類型修改方法。
  event.setDamageType(event.damageType);
  // @ts-expect-error 傷害後事件沒有武器類型修改方法。
  event.setWeaponType(event.weaponType);
  // @ts-expect-error 傷害資料欄位不能直接寫入。
  event.amount = 1;
  onDamaged.subscribe(value => {
    // @ts-expect-error 公開來源也必須維持唯讀事件型別。
    value.setAmount(1);
  });
}
void checkEvents;
