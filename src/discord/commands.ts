import { ApplicationIntegrationType, ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type SlashCommandStringOption } from 'discord.js';
const engines=[{name:'SaydiVoice',value:'saydi'},{name:'VOICEVOX',value:'voicevox'},{name:'ElevenLabs',value:'elevenlabs'},{name:'Fish Audio',value:'fish'}];
const engineOption=(o:SlashCommandStringOption)=>o.setName('engine').setDescription('音声エンジン').addChoices(...engines);
const scope=(o:SlashCommandStringOption)=>o.setName('scope').setDescription('省略時は自分。serverはサーバー管理者専用').addChoices({name:'自分',value:'user'},{name:'サーバー既定',value:'server'});
const cmd=(name:string,description:string)=>new SlashCommandBuilder().setName(name).setDescription(description)
  .setContexts(InteractionContextType.Guild).setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
export const commands=[
  cmd('join','今いるVCにBotを参加させます'),cmd('leave','BotをVCから退出させます'),
  cmd('say','AI合成音声で文章を読み上げます').addStringOption(o=>o.setName('text').setDescription('読み上げる文章').setRequired(true).setMaxLength(2000)),
  cmd('voice','読み上げ音声の一覧・選択・同期')
    .addSubcommand(s=>s.setName('list').setDescription('使用できる音声を表示').addStringOption(engineOption).addIntegerOption(o=>o.setName('page').setDescription('ページ番号').setMinValue(1)))
    .addSubcommand(s=>s.setName('set').setDescription('使用を許可された音声を選択').addStringOption(o=>o.setName('id').setDescription('音声名または音声IDから選択').setAutocomplete(true).setRequired(true)).addStringOption(engineOption).addStringOption(scope))
    .addSubcommand(s=>s.setName('sync').setDescription('管理者：外部APIから音声を同期').addStringOption(engineOption))
    .addSubcommand(s=>s.setName('approve').setDescription('管理者：権利・ライセンス確認済み音声を許可').addStringOption(o=>engineOption(o).setRequired(true)).addStringOption(o=>o.setName('id').setDescription('同期済み音声ID').setRequired(true).setAutocomplete(true)).addBooleanOption(o=>o.setName('rights').setDescription('声の利用許諾・ライセンス・クレジット条件を確認済み').setRequired(true)))
    .addSubcommand(s=>s.setName('revoke').setDescription('管理者：Bot内の音声利用許可を解除（外部音声は削除しません）').addStringOption(o=>engineOption(o).setRequired(true)).addStringOption(o=>o.setName('id').setDescription('音声ID').setRequired(true))),
  cmd('engine','自分またはサーバー既定の音声エンジンを変更').addStringOption(o=>engineOption(o).setRequired(true)).addStringOption(scope),
  cmd('speed','話速を変更（対応範囲はエンジンによって異なります）').addNumberOption(o=>o.setName('value').setDescription('通常1.0').setMinValue(0.25).setMaxValue(4).setRequired(true)).addStringOption(scope),
  cmd('pitch','高さを変更（VOICEVOXのみ対応）').addNumberOption(o=>o.setName('value').setDescription('通常0、-0.15〜0.15').setMinValue(-0.15).setMaxValue(0.15).setRequired(true)).addStringOption(scope),
  cmd('volume','読み上げ音量を変更').addNumberOption(o=>o.setName('value').setDescription('0〜100%').setMinValue(0).setMaxValue(100).setRequired(true)).addStringOption(scope),
  cmd('auto','管理者：専用チャンネルの自動読み上げ').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('on').setDescription('自動読み上げを有効にします')).addSubcommand(s=>s.setName('off').setDescription('自動読み上げを無効にします')),
  cmd('channel','管理者：自動読み上げチャンネル').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('set').setDescription('対象テキストチャンネルを指定').addChannelOption(o=>o.setName('channel').setDescription('読み上げ用チャンネル').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s=>s.setName('show').setDescription('現在の指定チャンネルを表示')),
  cmd('skip','現在の音声をスキップ（生成中も中止）'),cmd('stop','再生停止と待機列の全削除'),cmd('queue','待機列を表示（本文は保存・表示しません）'),
  cmd('settings','自分とサーバーの読み上げ設定を確認'),cmd('help','使い方とAI音声・クレジットを表示'),
  cmd('profile','自分の設定を操作')
    .addSubcommand(s=>s.setName('reset').setDescription('個人設定を消去してサーバー既定へ戻します'))
    .addSubcommand(s=>s.setName('fallback').setDescription('障害時のVOICEVOX代替音声を個人で許可').addBooleanOption(o=>o.setName('enabled').setDescription('別の声になることを了承する').setRequired(true))),
  cmd('admin','管理者：読み上げ設定・制限・利用量').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('limits').setDescription('文字数・連投・待機列・退出時間の上限')
      .addIntegerOption(o=>o.setName('max_chars').setDescription('1投稿の文字数').setMinValue(1).setMaxValue(2000))
      .addIntegerOption(o=>o.setName('user_per_minute').setDescription('個人の1分間投稿数').setMinValue(1).setMaxValue(30))
      .addIntegerOption(o=>o.setName('guild_per_minute').setDescription('サーバーの1分間投稿数').setMinValue(1).setMaxValue(120))
      .addIntegerOption(o=>o.setName('queue_size').setDescription('生成・再生中を含む待機列の件数').setMinValue(1).setMaxValue(100))
      .addIntegerOption(o=>o.setName('idle_seconds').setDescription('無人VCから退出までの秒数').setMinValue(15).setMaxValue(3600))
      .addIntegerOption(o=>o.setName('daily_chars').setDescription('サーバーの1日上限文字数').setMinValue(100).setMaxValue(1000000))
      .addIntegerOption(o=>o.setName('user_daily_chars').setDescription('個人の1日上限文字数').setMinValue(100).setMaxValue(100000)))
    .addSubcommand(s=>s.setName('engine').setDescription('サーバーで利用可能なエンジンを設定').addStringOption(o=>engineOption(o).setRequired(true)).addBooleanOption(o=>o.setName('enabled').setDescription('使用を許可する').setRequired(true)))
    .addSubcommand(s=>s.setName('pause').setDescription('読み上げを一時停止または再開').addBooleanOption(o=>o.setName('enabled').setDescription('trueで一時停止').setRequired(true)))
    .addSubcommand(s=>s.setName('fallback').setDescription('代替VOICEVOX音声を設定（利用者の個別許可も必要）').addStringOption(o=>o.setName('id').setDescription('許可済みVOICEVOXスタイルID。空欄で無効')))
    .addSubcommand(s=>s.setName('usage').setDescription('文字数上限・外部サービス利用量を確認').addStringOption(engineOption)),
];
export function commandJSON(){return commands.map(c=>c.toJSON());}
