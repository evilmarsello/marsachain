#!/usr/bin/env python3
"""Generate values-*/strings.xml from TMA i18n/messages.*.ts."""
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMA_I18N = ROOT / "TMA/webapp/src/i18n"
RES = ROOT / "app/src/main/res"

ANDROID_TO_TMA = {
    "onboarding_toolbar_default": "onbTitleDefault",
    "onboarding_welcome_tagline": "onbWelcome",
    "onboarding_understand_prefix": "onbUnderstandPrefix",
    "onboarding_terms_of_use_link": "onbTermsLink",
    "onboarding_understand_suffix": "onbUnderstandSuffix",
    "onboarding_understand_checkbox_a11y": "onbUnderstandPrefix",
    "onboarding_terms_dialog_title": "onbTermsTitle",
    "onboarding_terms_accept_button": "onbTermsAccept",
    "onboarding_terms_footer_acknowledge": "onbTermsFooter",
    "onboarding_backup_checkbox_label": "onbBackup",
    "onboarding_restore_seed_button": "onbHaveSeed",
    "common_cancel": "commonCancel",
    "common_loading": "commonLoading",
    "alert_no_active_wallet": "alertNoActiveWallet",
    "pools_title": "poolsPageTitle",
    "pools_intro": "poolsHowBody",
    "pools_load_failed": "poolsLoadFail",
    "pool_badge_active": "commonActive",
    "pool_badge_chosen": "poolYouChoseThisPool",
    "pool_join": "poolsJoinBtn",
    "pool_leave": "poolsLeaveBtn",
    "pool_withdraw": "poolsWithdrawBtn",
    "pool_join_hint": "poolsSelectOnMining",
    "pool_member_hint": "poolAlreadyMemberInPool",
    "pool_wallet_other_pool": "miningWalletBoundOtherPool",
    "mining_finish_solo_stake": "poolStakeSoloBlocksJoin",
    "pool_stake_pending": "poolStakeSending",
    "pool_join_title": "poolStakeTitle",
    "pool_stake_fee_hint": "poolStakeFeeHint",
    "pool_stake_amount_hint": "poolStakeAmountPlaceholder",
    "pool_stake_min": "poolStakeMin",
    "pool_stake_sending": "poolStakeSending",
    "pool_stake_sent": "poolStakeSent",
    "pool_stake_failed": "commonError",
    "pool_leave_title": "poolsLeaveBtn",
    "pool_leave_hint": "poolsDetailUnstake",
    "pool_leave_sending": "poolLeaveSending",
    "pool_leave_sent": "poolLeaveSent",
    "pool_leave_failed": "commonError",
    "pool_withdraw_blocked": "poolsOwedCannotWithdraw",
    "pool_withdraw_sent": "poolWithdrawSent",
    "mining_mode_solo": "miningModeSolo",
    "mining_mode_pool": "miningModePool",
    "mining_select_pool_first": "miningSelectPoolFirst",
    "mining_create_pool_stake": "miningCreatePoolStakeBtn",
    "mining_finish_solo_first": "miningFinishSoloStakeLine1",
    "mining_wallet_in_pool": "miningWalletInPoolLine1",
    "mining_switch_to_pool": "miningSwitchToPoolMode",
    "mining_orphan_pool_stake": "miningOrphanPoolStakeLine1",
    "mining_pool_stake_sent": "poolStakeSent",
    "settings_pool_unstake_blocked": "settingsMinerUnstakePoolBlocked",
    "history_filter_all": "historyFilterAll",
    "history_filter_sent": "historyFilterSent",
    "history_filter_received": "historyFilterReceived",
    "history_filter_mining": "historyFilterMining",
    "history_filter_stakes": "historyFilterStakes",
    "history_empty": "historyEmpty",
    "history_pull_hint": "walletPullHint",
    "history_no_wallets": "historyNoWallets",
    "language_title": "languageTitle",
    "wallet_balance_hide": "walletBalanceHide",
    "wallet_balance_show": "walletBalanceShow",
    "tab_wallet": "tabWallet",
    "tab_mine": "tabMining",
    "tab_settings": "tabSettings",
    "title_mining": "screenMining",
    "title_wallet": "screenWallet",
    "title_settings": "screenSettings",
    "title_statistics": "statsTitle",
    "title_history": "historyTitle",
    "title_wallets": "walletsTitle",
    "title_my_wallets": "walletsTitle",
    "title_deleted_wallets": "trashTitle",
    "title_wallet_settings": "wsTitle",
    "title_connections": "connTitle",
    "title_about": "settingsAboutApp",
    "title_about_marsa": "settingsAboutMarsa",
    "wallet_balance_label": "walletBalanceLab",
    "wallet_send": "walletSend",
    "wallet_receive": "walletReceive",
    "wallet_history": "walletHistory",
    "wallet_import": "walletImport",
    "wallet_my_wallets": "walletMyWallets",
    "wallet_new_wallet": "walletNewWallet",
    "wallet_mining_pools": "walletMiningPools",
    "wallet_settings_btn": "walletWalletSettings",
    "wallet_default_name": "tabWallet",
    "wallet_coin_transfers": "walletCoinTransfersTitle",
    "wallet_no_transactions": "walletNoTx",
    "wallet_tx_kind_send": "historyFilterSent",
    "wallet_tx_kind_receive": "historyFilterReceived",
    "wallet_tx_kind_mining": "historyFilterMining",
    "pools_join_mining_pool": "poolsJoinBtn",
    "pools_finder_equal": "poolsFinderEqual",
    "pools_finder_bonus": "poolsFinderLabel",
    "pool_detail_pool_stats": "poolDetailPoolStats",
    "pool_detail_your_stats": "poolDetailYourStats",
    "pool_detail_refresh_failed": "poolDetailRefreshFailed",
    "pool_stat_miners": "poolStatMiners",
    "pool_blocks_won_total": "poolBlocksWonTotal",
    "pool_treasury_balance": "poolTreasuryBalance",
    "pool_last_round_label": "poolLastRoundLabel",
    "pool_last_round_none": "poolLastRoundNone",
    "pool_mining_participation_hint": "poolMiningParticipationHint",
    "pool_share_hint": "poolShareHint",
    "pool_not_in_this_pool": "poolNotInThisPool",
    "pool_you_chose_this_pool": "poolYouChoseThisPool",
    "pools_withdraw_btn": "poolsWithdrawBtn",
    "pools_already_in_other_pool": "poolsAlreadyInOtherPool",
    "pool_finish_unstake_btn": "poolFinishUnstakeBtn",
    "pools_owed_cannot_withdraw": "poolsOwedCannotWithdraw",
    "settings_network": "settingsNetwork",
    "settings_connections": "settingsConnections",
    "settings_mining_stake": "settingsMiningStake",
    "settings_miner_unstake_hint": "settingsMiningStakeHint",
    "settings_miner_unstake": "settingsMinerUnstake",
    "settings_exit_wallet": "settingsResetSeed",
    "settings_information": "settingsInformation",
    "settings_no_wallets": "walletsEmptyTitle",
    "settings_info_about_app": "settingsInfoAboutApp",
    "settings_info_about_marsa": "settingsInfoAboutMarsa",
    "settings_info_network_config": "settingsInfoNetworkConfig",
    "settings_info_social_media": "settingsInfoSocialMedia",
    "network_config_title": "networkConfigTitle",
    "social_media_title": "socialMediaTitle",
    "social_telegram": "socialTelegram",
    "social_x": "socialX",
    "pool_open": "poolsOpenPoolBtn",
    "stats_staked_miners": "statsStakedMiners",
    "mining_total_balance": "miningTotalBalance",
    "mining_total_blocks": "miningTotalBlocks",
    "mining_active_miners": "miningActiveMiners",
    "mining_difficulty": "miningDifficulty",
    "mining_stake_lab": "miningStakeLab",
    "mining_stake_not_active": "miningStakeNotActive",
    "mining_credit_per_hash": "miningCreditPerHash",
    "mining_unstake_lab": "miningUnstakeLab",
    "mining_unstake_now": "miningUnstakeNow",
    "mining_unstake_avail": "miningUnstakeAvail",
    "mining_credits_lab": "miningCreditsLab",
    "mining_wait_refill": "miningWaitRefill",
    "mining_create_stake_btn": "miningCreateStakeBtn",
    "mining_create_stake_hint": "miningCreateStakeHint",
    "mining_tap_no_wallet": "miningTapNoWallet",
    "mining_tap_no_stake": "miningTapNoStake",
    "mining_tap_challenge_failed": "miningTapChallengeFailed",
    "mining_tap_sign_failed": "miningTapSignFailed",
    "mining_tap_rate_limit": "miningTapRateLimit",
    "stake_title": "stakeTitle",
    "stake_balance": "stakeBalance",
    "stake_min": "stakeMin",
    "stake_amount_label": "stakeAmountLabel",
    "stake_amount_placeholder": "stakeAmountPlaceholder",
    "stake_credits_hint": "stakeCreditsHint",
    "stake_refill_hint": "stakeRefillHint",
    "stake_lock_hint": "stakeLockHint",
    "stake_create_btn": "stakeCreateBtn",
    "stake_enter_amount": "stakeEnterAmount",
    "stake_invalid_amount": "stakeInvalidAmount",
    "stake_min_amount": "stakeMinAmount",
    "stake_insufficient": "stakeInsufficient",
    "stake_sending": "stakeSending",
    "stake_sent": "stakeSent",
    "stake_confirmed": "stakeConfirmed",
    "common_ok": "commonOk",
    "common_reset": "commonReset",
    "stats_reset_title": "statsResetTitle",
    "stats_reset_hint": "statsResetHint",
    "reset_wallet_title": "resetWalletTitle",
    "reset_wallet_continue": "resetWalletContinue",
    "pools_info_btn": "poolsInfoBtn",
    "pools_info_title": "miningPoolsTitle",
    "pools_info_body1": "miningPoolsBody1",
    "pools_info_body2": "miningPoolsBody2",
    "pools_how_title": "poolsHowTitle",
    "pools_how_body": "poolsHowBody",
    "pools_custodial_note": "poolsCustodialNote",
}

# Compact wallet action labels (single line under icon)
WALLET_SHORT = {
    "en": {
        "wallet_import": "Import",
        "wallet_my_wallets": "Wallets",
        "wallet_new_wallet": "New",
        "wallet_mining_pools": "Pools",
        "wallet_settings_btn": "Settings",
    },
    "ru": {
        "wallet_import": "Импорт",
        "wallet_my_wallets": "Кошельки",
        "wallet_new_wallet": "Новый",
        "wallet_mining_pools": "Пулы",
        "wallet_settings_btn": "Настройки",
    },
    "de": {
        "wallet_import": "Import",
        "wallet_my_wallets": "Wallets",
        "wallet_new_wallet": "Neu",
        "wallet_mining_pools": "Pools",
        "wallet_settings_btn": "Einst.",
    },
    "es": {
        "wallet_import": "Importar",
        "wallet_my_wallets": "Carteras",
        "wallet_new_wallet": "Nueva",
        "wallet_mining_pools": "Pools",
        "wallet_settings_btn": "Ajustes",
    },
    "fr": {
        "wallet_import": "Importer",
        "wallet_my_wallets": "Portef.",
        "wallet_new_wallet": "Nouveau",
        "wallet_mining_pools": "Pools",
        "wallet_settings_btn": "Réglages",
    },
    "pt": {
        "wallet_import": "Importar",
        "wallet_my_wallets": "Carteiras",
        "wallet_new_wallet": "Nova",
        "wallet_mining_pools": "Pools",
        "wallet_settings_btn": "Ajustes",
    },
    "id": {
        "wallet_import": "Impor",
        "wallet_my_wallets": "Dompet",
        "wallet_new_wallet": "Baru",
        "wallet_mining_pools": "Pool",
        "wallet_settings_btn": "Setelan",
    },
    "ja": {
        "wallet_import": "インポート",
        "wallet_my_wallets": "ウォレット",
        "wallet_new_wallet": "新規",
        "wallet_mining_pools": "プール",
        "wallet_settings_btn": "設定",
    },
    "ar": {
        "wallet_import": "استيراد",
        "wallet_my_wallets": "محافظ",
        "wallet_new_wallet": "جديد",
        "wallet_mining_pools": "مجمعات",
        "wallet_settings_btn": "إعدادات",
    },
}

# TMA locales missing some mining stat keys (fall back to English spread)
LOCALE_OVERRIDES = {
    "ar": {
        "mining_total_blocks": "إجمالي الكتل:",
        "mining_active_miners": "معدّنون نشطون:",
        "mining_difficulty": "الصعوبة:",
        "mining_credits_lab": "أرصدة التعدين: ",
        "mining_stake_lab": "حصة التعدين: ",
        "mining_stake_not_active": "غير نشط",
        "mining_credit_per_hash": "رصيد واحد (تجزئة): ",
        "mining_unstake_now": "متاح الآن",
        "pools_how_title": "كيف يعمل",
    },
    "es": {
        "mining_total_blocks": "Bloques totales:",
        "mining_active_miners": "Mineros activos:",
        "mining_difficulty": "Dificultad:",
        "mining_credits_lab": "Créditos de minería: ",
        "mining_stake_lab": "Stake de minería: ",
        "mining_stake_not_active": "Inactivo",
        "mining_credit_per_hash": "1 crédito (1 hash): ",
        "mining_unstake_now": "disponible ahora",
        "pools_how_title": "Cómo funciona",
    },
}

# Keep English / native labels / tx technical strings
SKIP_KEYS = {
    "tx_kind_miner_stake", "tx_kind_miner_unstake", "tx_kind_miner_pool_stake",
    "tx_kind_miner_pool_unstake", "tx_kind_stake", "tx_kind_unstake",
    "tx_kind_validator_reward", "tx_route_stake",
    "wallets_miner_badge", "wallets_pool_miner_badge",
    "wallet_tx_label_from", "wallet_tx_label_to",
    "wallet_tx_amount_label", "wallet_tx_fee_label", "wallet_tx_block_label",
    "wallet_tx_hash", "wallet_balance_hidden_mask",
    "language_english", "language_russian", "language_spanish", "language_arabic",
    "language_french", "language_portuguese", "language_indonesian",
    "language_german", "language_japanese",
}

CONN_NODE = {
    "en": "Node %1$d",
    "ru": "Нода %1$d",
    "de": "Knoten %1$d",
    "es": "Nodo %1$d",
    "fr": "Nœud %1$d",
    "pt": "Nó %1$d",
    "id": "Node %1$d",
    "ar": "العقدة %1$d",
    "ja": "ノード %1$d",
}

ANDROID_LOCALE_DIRS = {
    "ru": "values-ru",
    "de": "values-de",
    "es": "values-es",
    "ar": "values-ar",
    "fr": "values-fr",
    "pt": "values-pt",
    "id": "values-in",
    "ja": "values-ja",
}


def template_to_android_fmt(tmpl: str) -> str:
    """Convert TMA `${var}` templates to Android format args."""
    out = tmpl
    idx = 1
    for var in re.findall(r"\$\{(\w+)\}", tmpl):
        kind = "d" if var in ("blocks", "secApprox", "block", "height", "n", "b", "s") else "s"
        out = out.replace(f"${{{var}}}", f"%{idx}${kind}", 1)
        idx += 1
    return out


def parse_ts(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for m in re.finditer(r'^\s+(\w+):\s*"((?:[^"\\]|\\.)*)"', text, re.M):
        key, val = m.group(1), m.group(2)
        out[key] = val.replace("\\n", "\n").replace('\\"', '"')
    for m in re.finditer(
        r"^\s+(\w+):\s*\([^)]*\)\s*=>\s*`((?:[^`\\]|\\.)*)`",
        text,
        re.M,
    ):
        out[m.group(1)] = template_to_android_fmt(m.group(2))
    for m in re.finditer(
        r"^\s+(\w+):\s*\([^)]*\)\s*=>\s*\n\s*`((?:[^`\\]|\\.)*)`",
        text,
        re.M,
    ):
        out[m.group(1)] = template_to_android_fmt(m.group(2))
    return out


def load_en_defaults() -> dict[str, str]:
    tree = ET.parse(RES / "values/strings.xml")
    return {el.attrib["name"]: el.text or "" for el in tree.getroot().findall("string")}


def esc_android(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("'", "\\'")
        .replace('"', '\\"')
        .replace("\n", "\\n")
    )


def resolve_value(name: str, default: str, locale: str, tma: dict[str, str]) -> str:
    short = WALLET_SHORT.get(locale, {}).get(name)
    if short:
        return short
    override = LOCALE_OVERRIDES.get(locale, {}).get(name)
    if override:
        return override
    if name == "connection_node_name":
        return CONN_NODE.get(locale, CONN_NODE["en"])
    tma_key = ANDROID_TO_TMA.get(name)
    if tma_key and tma_key in tma:
        val = tma[tma_key]
        # Strip TMA template placeholders for Android format strings
        if name == "pool_join_title" and "${" in val:
            return val.replace("${poolName}", "%1$s")
        if name == "pool_stake_min" and "${" in val:
            return val.replace("${min}", "%1$s")
        if name == "mining_wallet_in_pool" and "«" in val:
            return default
        if "%" not in val and "${" in val:
            return template_to_android_fmt(val)
        return val
    return default


def generate_locale(locale: str, en: dict[str, str], tma: dict[str, str]) -> str:
    lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"]
    for name, default in en.items():
        if name in SKIP_KEYS:
            continue
        value = resolve_value(name, default, locale, tma)
        lines.append(f'    <string name="{name}">{esc_android(value)}</string>')
    lines.append("</resources>")
    lines.append("")
    return "\n".join(lines)


def main():
    en = load_en_defaults()
    en_tma = parse_ts(TMA_I18N / "messages.en.ts")
    for loc, folder in ANDROID_LOCALE_DIRS.items():
        ts = TMA_I18N / f"messages.{loc}.ts"
        if not ts.exists():
            print(f"skip {loc}: no TMA file")
            continue
        tma = {**en_tma, **parse_ts(ts)}
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        content = generate_locale(loc, en, tma)
        (out_dir / "strings.xml").write_text(content, encoding="utf-8")
        print(f"wrote {out_dir / 'strings.xml'} ({content.count('<string')} strings)")


if __name__ == "__main__":
    main()
