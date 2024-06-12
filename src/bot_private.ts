import * as instance from './bot'
import {StateCode, OptionCode} from './bot'
import * as utils from './utils'
import * as afx from './global'
import * as swapManager from './swap_manager'

import assert from 'assert'
import dotenv from 'dotenv'

dotenv.config()

/*

start - welcome
snipe - snipe setting
wallet - manage your bot wallet
*/

const parseCode = async (database: any, session: any, wholeCode: string) => {

	let codes: string[] = wholeCode.split('_')
	console.log(codes)

	if (codes.length % 2 === 0) {
		for (let i = 0; i < codes.length; i += 2) {

			const type = codes[i]
			const code = codes[i + 1]

			if (type === 'ref') {

				if (!session.referredBy) {
					let referredBy: string = ''
			
					referredBy = utils.decodeChatId(code)
					if (referredBy === '' || referredBy === session.chatid) {
						continue
					}
			
					if (referredBy.length > 0) {
			
						const refSession = instance.sessions.get(referredBy)
						if (refSession) {
							console.log(`${session.username} has been invited by @${refSession.username} (${refSession.chatid})`)
						}
			
						instance.sendInfoMessage(referredBy, `Great news! You have invited @${session.username}
You can earn 30% of their fees in the first month. 20% in the second and 10% forever!`)
			
						session.referredBy = referredBy
						session.referredTimestamp = new Date().getTime()

						await database.updateUser(session)
					}
				}

			} else if (type === 'ga') {
				
				if (session && instance._callback_proc) {
					// instance._callback_proc(OptionCode.GAME_DETAIL, { session, gameId: code })
					await instance.executeCommand(session.chatid, undefined, undefined, {c: OptionCode.GAME_DETAIL, k:1 })
				}

				return true

			} 
		}
	}

	return false
}

export const procMessage = async (message: any, database: any) => {

	let chatid = message.chat.id.toString();
	let session = instance.sessions.get(chatid)
	let userName = message?.chat?.username;
	let messageId = message?.messageId

	if (message.photo) {
		console.log(message.photo)
		processSettings(message, database);
	}

	if (message.animation) {
		console.log(message.animation)
		processSettings(message, database);
	}

	if (!message.text)
		return;

	let command = message.text;
	if (message.entities) {
		for (const entity of message.entities) {
			if (entity.type === 'bot_command') {
				command = command.substring(entity.offset, entity.offset + entity.length);
				break;
			}
		}
	}

	if (command.startsWith('/')) {

		if (!session) {

			if (!userName) {
				console.log(`Rejected anonymous incoming connection. chatid = ${chatid}`);
				instance.sendMessage(chatid, `Welcome to ${process.env.BOT_TITLE} bot. We noticed that your telegram does not have a username. Please create username [Setting]->[Username] and try again.`)
				return;
			}

			if (false && !await instance.checkWhitelist(chatid)) {

				//instance.sendMessage(chatid, `😇Sorry, but you do not have permission to use alphBot. If you would like to use this bot, please contact the developer team at ${process.env.TEAM_TELEGRAM}. Thanks!`);
				console.log(`Rejected anonymous incoming connection. @${userName}, ${chatid}`);
				return;
			}

			console.log(`@${userName} session has been permitted through whitelist`);

			session = await instance.createSession(chatid, userName, 'private');
			session.permit = 1;

			await database.updateUser(session)
		}

		if (userName && session.username !== userName) {
			session.username = userName
			await database.updateUser(session)
		}

		// if (session.permit !== 1) {
		// 	session.permit = await instance.isAuthorized(session) ? 1 : 0;
		// }

		// if (false && session.permit !== 1) {
		// 	//instance.sendMessage(chatid, `😇Sorry, but you do not have permission to use alphBot. If you would like to use this bot, please contact the developer team at ${process.env.TEAM_TELEGRAM}. Thank you for your understanding. [2]`);
		// 	return;
		// }

		let params = message.text.split(' ');
		if (params.length > 0 && params[0] === command) {
			params.shift()
		}
		
		command = command.slice(1);

		if (command === instance.COMMAND_START) { 

			let hideWelcome: boolean = false
			if (params.length == 1 && params[0].trim() !== '') {

				let wholeCode = params[0].trim()
				hideWelcome = await parseCode(database, session, wholeCode)
			}

			if (!hideWelcome) {
				await instance.executeCommand(chatid, undefined, undefined, {c: OptionCode.MAIN_MENU, k:1 })
			}

		} else {
			
			console.log(`Command Execute: /${command} ${params}`)
			if (instance._command_proc) {
				instance._command_proc(session, command, params, messageId)
			}
		}

		// instance.stateMap_remove(chatid)

	} else if (message) {

		processSettings(message, database);
		await instance.removeMessage(chatid, message.message_id) //TGR
		await instance.removeMessage(chatid, message.message_id)

	} 
}

const processSettings = async (msg: any, database: any) => {

	const sessionId = msg.chat?.id.toString()

	const session = instance.sessions.get(sessionId)
	if (!session) {
		return
	}

	let stateNode = instance.stateMap_getFocus(sessionId)
	if (!stateNode) {
		instance.stateMap_setFocus(sessionId, StateCode.IDLE, { sessionId: sessionId })
		stateNode = instance.stateMap_get(sessionId)

		assert(stateNode)
	}

	const stateData = stateNode.data
		
	if (stateNode.state === StateCode.WAIT_SET_WALLET_IMPORT_PKEY) {

		const value = msg.text.trim()
		if (!value || value === '') {
			instance.sendInfoMessage(sessionId, `🚫 Sorry, the address you entered is invalid. Please try again`)
			return
		}

		// const isSeed = utils.isValidSeedPhrase(value)

		// let pkey: string | null = null, seed: string | null = null

		// if (!isSeed) {

		// 	if (!utils.isValidPrivateKey(value)) {
		// 		await instance.sendInfoMessage(sessionId, `🚫 Sorry, the key you entered is invalid. Please try again`)
		// 		return
		// 	}

		// 	pkey = value

		// } else {

		// 	seed = value
		// 	pkey = await utils.seedPhraseToPrivateKey(value)
		// 	if (!pkey) {
		// 		await instance.sendInfoMessage(sessionId, `🚫 Sorry, the mnemonic key you entered is invalid. Please try again`)
		// 		return
		// 	}
		// }

		let wallet = utils.getWalletFromPrivateKey(value ?? '')
		if (!wallet) {
			await instance.sendInfoMessage(sessionId, `🚫 Sorry, the private key you entered is invalid. Please try again`)
			return
		}

		session.wallet = wallet.publicKey
		session.pkey = utils.encryptPKey(value as string)

		await database.updateUser(session)
		await instance.sendReplyMessage(sessionId, `✅ New wallet has been imported successfully.`)
		//instance.executeCommand(sessionId, undefined, undefined, {c: OptionCode.MAIN_WALLET, k:`${sessionId}:1` })
		instance.executeCommand(sessionId, undefined, undefined, {c: OptionCode.MAIN_MENU, k:1 })

	} else if (stateNode.state === StateCode.WAIT_SET_TOKEN_IMPORT) {

		const value = msg.text.trim()
		if (!value || value.length <= 0 || value.length > 100) {
			await instance.sendInfoMessage(sessionId, `🚫 Sorry, the value you entered is invalid. Please try again`)
			return
		}

		session.tokenAddress = value

		const msg1 = `✅ Token address successfully set.`
		await instance.sendReplyMessage(sessionId, msg1);
		instance.executeCommand(sessionId, undefined, undefined, {c: OptionCode.MAIN_MENU, k:1 })
	}
}
