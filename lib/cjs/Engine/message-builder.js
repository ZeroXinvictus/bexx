"use strict";
// bexx message-builder engine — friendly wrappers around existing socket methods.
//
// sendMessage already routes pollCreationMessage, reactionMessage, contactMessage,
// locationMessage, orderMessage, paymentRequestMessage, buttonsMessage, listMessage
// via content keys. These builders just shape the proto for you so you don't
// hand-roll the fields. No new socket code — pure builders + one send call.

Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessageBuilderEngine = makeMessageBuilderEngine;

function makeMessageBuilderEngine(sock, _options) {
	// ponytail: all builders return plain content objects you feed to sock.sendMessage.
	// The single send() helper builds + sends in one call.

	// --- poll: sock.sendPoll(jid, "Pick one", ["A","B","C"], { pollType: "REGULAR", selectableCount: 2 }) ---
	const sendPoll = (jid, name, options, opts = {}) => {
		const content = {
			pollCreationMessageV5: {
				name,
				v5: {
					options: (Array.isArray(options) ? options : [options]).map(o => ({
						text: typeof o === "string" ? o : o.text ?? o.label ?? "",
						locality: o.locality ?? ""
					})),
					selections: [],
					...(opts.pollType ? { pollType: opts.pollType } : {}),
					...(opts.selectableCount != null ? { selectableCount: opts.selectableCount } : {})
				}
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- reaction: sock.react(key, "👍") ---
	// key = { remoteJid, id, fromMe }
	const react = (key, reaction) => {
		const content = {
			reactionMessage: {
				key,
				text: reaction ?? "✅"
			}
		};
		const jid = key?.remoteJid ?? sock.user?.id;
		return sock.sendMessage(jid, content);
	};

	// --- edit: sock.edit(key, "new text") ---
	const edit = (key, text) => {
		const content = {
			extendedTextMessage: {
				text,
				contextInfo: {
					participant: key?.fromMe ? "0@s.whatsapp.net" : key?.remoteJid,
					quotation: { key }
				}
			}
		};
		// ponytail: WA edits use the editrich path for rich, plain extendedTextMessage for text.
		// For now, send as extendedTextMessage with quotation context — WA renders it as an edit.
		const jid = key?.remoteJid ?? sock.user?.id;
		return sock.sendMessage(jid, content);
	};

	// --- contact: sock.sendContact(jid, "John", "628123456789", { org? }) ---
	const sendContact = (jid, name, number, opts = {}) => {
		const vcard = generateVCard(name, number, opts);
		const content = {
			contactMessage: {
				contact: {
					displayName: name,
					vcard
				}
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- location: sock.sendLocation(jid, -6.2, 106.8, "Jakarta", "Kota") ---
	const sendLocation = (jid, lat, lon, label = "", description = "", opts = {}) => {
		const content = {
			locationMessage: {
				degreesLatitude: lat,
				degreesLongitude: lon,
				name: label,
				message: description,
				accurate: opts.accurate ?? true,
				...(opts.locName ? { locName: opts.locName } : {})
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- order: sock.sendOrder(jid, [{ item, quantity, price, img }], "IDR", "Note", { orderId }) ---
	const sendOrder = (jid, items, currency, note = "", opts = {}) => {
		const content = {
			orderMessage: {
				items: (Array.isArray(items) ? items : [items]).map(i => ({
					productId: i.productId ?? "",
					price: i.price ?? 0,
					quantity: i.quantity ?? 1,
					itemCount: i.itemCount ?? i.quantity ?? 1,
					productImage: i.img ?? i.productImage,
					...(i.productName ? { productName: i.productName } : {})
				})),
				orderDetails: note,
				...(opts.orderId ? { orderId: opts.orderId } : {}),
				...(opts.orderDate ? { orderDate: opts.orderDate } : {}),
				...(opts.thumbnail ? { thumbnail: opts.thumbnail } : {})
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- payment: sock.sendPayment(jid, 100000, "IDR", "Order #123") ---
	const sendPayment = (jid, amount, currency = "IDR", note = "", opts = {}) => {
		const content = {
			paymentRequestMessage: {
				amount1000: Math.floor(amount / 1000),
				currencyCode: currency,
				request3panToken: opts.request3panToken ?? "",
				transactionSize: 0,
				...(note ? { note } : {})
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- buttons: sock.sendButtons(jid, "Choose", [{ text: "A", id: "a" }, { text: "B", id: "b" }], { footer? }) ---
	const sendButtons = (jid, text, buttons, opts = {}) => {
		const content = {
			buttonsMessage: {
				text,
				buttons: (Array.isArray(buttons) ? buttons : [buttons]).map((b, i) => ({
					...(typeof b === "string"
						? { text: b, type: 1, id: `btn_${i}` }
						: {
							text: b.text ?? b.label ?? `Button ${i + 1}`,
							type: b.type ?? 1,
							id: b.id ?? `btn_${i}`,
							...(b.nativeFlowInfo ? { nativeFlowInfo: b.nativeFlowInfo } : {})
						}
					)
				})),
				...(opts.footer ? { footerText: opts.footer } : {})
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- list: sock.sendList(jid, "Menu", [{ title: "A", rowId: "a" }], { button? }) ---
	const sendList = (jid, title, sections, opts = {}) => {
		const content = {
			listMessage: {
				title,
				description: opts.description ?? "",
				buttonText: opts.buttonText ?? "Menu",
				sections: (Array.isArray(sections) ? sections : [sections]).map(sec => ({
					title: sec.title ?? sec.sectionTitle ?? "Section",
					rows: (sec.rows ?? sec).map(r => ({
						rowId: r.rowId ?? r.id ?? r,
						title: r.title ?? r,
						description: r.description ?? ""
					}))
				}))
			}
		};
		return sock.sendMessage(jid, content, opts);
	};

	// --- quoted send: sock.sendMessageWithQuote(jid, { text: "hi" }, quotedKey) ---
	const sendMessageWithQuote = (jid, content, quotedKey, opts = {}) => {
		const cached = sock.messages?.get(quotedKey.id ?? quotedKey);
		const msg = cached?.message ?? {};
		const fullContent = {
			...content,
			contextInfo: {
				quotation: { key: quotedKey, message: msg, conversation: msg.conversation }
			}
		};
		return sock.sendMessage(jid, fullContent, opts);
	};

	// --- group members: sock.getGroupMembers(jid) ---
	const getGroupMembers = async (jid) => {
		const meta = await sock.groupMetadata(jid);
		return (meta?.participants ?? []).map(p => ({
			id: p.id,
			oldestId: p.oldestId,
			jid: p.jid,
			lid: p.lid,
			...(p.promotedTimestamp ? { promotedTimestamp: p.promotedTimestamp } : {})
		}));
	};

	// --- pin: sock.pinMessage(key) / sock.unpinMessage(key) ---
	const pinMessage = (key) => sock.sendMessage(key?.remoteJid ?? sock.user?.id, { pinInChatMessage: { key, pin: true } });
	const unpinMessage = (key) => sock.sendMessage(key?.remoteJid ?? sock.user?.id, { pinInChatMessage: { key, pin: false } });

	// --- read receipt: sock.readReceipt(jid, key, "READ") ---
	const readReceipt = (jid, key, type = "READ") => sock.sendReceipt(jid, "0@s.whatsapp.net", [key?.id ?? key], type);

	// ponytail: generateVCard is the standard minimal vCard. Not a full vCard library.
	const generateVCard = (name, number, opts = {}) => {
		const lines = [
			"BEGIN:VCARD",
			"VERSION:3.0",
			`FN:${name}`,
			`TEL;type=CELL${opts.org ? ";type=WORK" : ""}:${number}`,
			...(opts.org ? [`ORG:${opts.org}`] : []),
			...(opts.note ? [`NOTE:${opts.note}`] : []),
			"END:VCARD"
		];
		return lines.join("\n");
	};

	return {
		sendPoll,
		react,
		edit,
		sendContact,
		sendLocation,
		sendOrder,
		sendPayment,
		sendButtons,
		sendList,
		sendMessageWithQuote,
		getGroupMembers,
		pinMessage,
		unpinMessage,
		readReceipt,
		generateVCard
	};
}
