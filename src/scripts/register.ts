import { PermissionFlagsBits, REST, Routes } from 'discord.js';
import { readConfig } from '../config.js';
import { commandJSON } from '../discord/commands.js';
const config=readConfig();
if(!config.DISCORD_TOKEN||!/^\d+$/.test(config.DISCORD_CLIENT_ID)){
  console.error('DISCORD_TOKENとDISCORD_CLIENT_IDを.envに設定してください。');process.exitCode=1;
}else{
  const rest=new REST({version:'10'}).setToken(config.DISCORD_TOKEN);
  const path=config.DISCORD_GUILD_ID?Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID,config.DISCORD_GUILD_ID):Routes.applicationCommands(config.DISCORD_CLIENT_ID);
  try{
    await rest.put(path,{body:commandJSON()});console.log(`${commandJSON().length}コマンドを${config.DISCORD_GUILD_ID?'検証サーバー':'全サーバー'}へ登録しました。`);
    const permissions=PermissionFlagsBits.AttachFiles|PermissionFlagsBits.ViewChannel|PermissionFlagsBits.SendMessages|PermissionFlagsBits.Connect|PermissionFlagsBits.Speak;
    const url=new URL('https://discord.com/oauth2/authorize');url.searchParams.set('client_id',config.DISCORD_CLIENT_ID);url.searchParams.set('scope','bot applications.commands');url.searchParams.set('permissions',String(permissions));url.searchParams.set('integration_type','0');
    console.log('所有者が確認して使用する招待URL: '+url.toString());
  }catch{console.error('登録に失敗しました。トークン、アプリID、サーバーID、Discordへの接続を確認してください。');process.exitCode=1;}
}
