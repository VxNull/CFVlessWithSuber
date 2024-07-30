// <!--GAMFC-->version base on commit 43fad05dcdae3b723c53c226f8181fc5bd47223e, time is 2023-06-22 15:20:02 UTC<!--GAMFC-END-->.
// @ts-ignore
import { connect } from 'cloudflare:sockets';

// How to generate your own UUID:
// [Windows] Press "Win + R", input cmd and run:  Powershell -NoExit -Command "[guid]::NewGuid()"
let userID = '77a571fb-4fd2-4b37-8596-1b7d9728bb5c';

const c_goodips = [
	{country:"JP", proxyIP:["168.138.46.67","140.238.52.86","140.238.37.208","146.56.38.45"], cfIP: ["154.92.9.201","172.64.40.4","172.64.33.121","64.110.104.30"] },
	{country:"KR", proxyIP:["132.145.81.117","140.238.28.86"], cfIP: [] },
	{country:"SG", proxyIP:["8.222.225.193","8.222.208.38","52.220.43.42"], cfIP: [] },
	{country:"NL", proxyIP:["185.121.225.144","89.110.64.238","94.131.106.61"], cfIP: [] },
	{country:"GB", proxyIP:["212.118.252.156","5.10.244.233","193.149.190.163"], cfIP: [] },
	{country:"US", proxyIP:["152.70.249.67"], cfIP: ["172.67.162.248","172.67.202.136","104.18.125.66"] },
];
const MPRO = 'dmxlc3M=';
// default random proxyIP pools
const proxyIPs = [""]; //workers.cloudflare.cyou bestproxy.onecf.eu.org cdn-all.xn--b6gac.eu.org cdn.xn--b6gac.eu.org

let clash_template_url = "https://raw.githubusercontent.com/VxNull/ClashTemplate/main/v2aryse_clash_meta_templ_v2.yaml";

let proxyIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];

if (!isValidUUID(userID)) {
	throw new Error('uuid is not valid');
}

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
	 * @param {uuid: string, proxyip: string} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		try {
			userID = env.UUID || userID;
			proxyIP = env.PROXYIP || proxyIP;
			const shortSecUrl = env.SHORT_SEC_URL || '-----';
			const upgradeHeader = request.headers.get('Upgrade');
			const url = new URL(request.url);
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				switch (url.pathname) {
					case `/${shortSecUrl}`: {
						if (!env.SHORT_SEC_URL) {
							return new Response("Forbidden", { status: 403 })
						}
					}//fall-through
					case `/${userID}`: {
						if (request.method == "POST") {
							if ((!env.GOODIP_KV) || (env.ACCESS_KEY && request.headers.get("Access-Key") != env.ACCESS_KEY)) {
								return new Response("Forbidden", { status: 403 })
							}
							return await handleStoreRequest(request, env)
						}

						const reqSub = url.searchParams.get('sub');
						const reqSpeed = url.searchParams.get('speed') || -1;
						clash_template_url = env.CLASH_TEMPL_URL || clash_template_url;

                        if (reqSub == "print_kv") {
							if ((!env.GOODIP_KV)) {
								return new Response("Forbidden", { status: 403 })
							}
							return await handleGetCountriesRequest(env);
						}

						//Read all goodip
						let goodIps = c_goodips;
						if(env.GOODIP_KV) {

							//判定是否存有goodips KV
							const kv_goodips = await env.GOODIP_KV.get("GOODIPS");
							if (kv_goodips) {
								goodIps = JSON.parse(kv_goodips);
							} else {
								//兼容旧版本-分散存储
								// 获取所有键名，即所有国家
								const listResult = await env.GOODIP_KV.list();
								const countries = listResult.keys.map(key => key.name);

								// 获取所有GoodIp对象
								if (countries.length) {
									goodIps = [];
								}

								for (const country of countries) {
									const value = (country.length==2)? await env.GOODIP_KV.get(country):null;
									if (value) {
										goodIps.push(JSON.parse(value));
									}
								}
							}
						}
						if (reqSub == "clash") {
							return await handleClSub(goodIps, clash_template_url, userID, request, reqSpeed);
						} else {
							return await handleVlSub(goodIps, userID, request, (reqSub == "raw"), reqSpeed);
						}
					}
					case `/ip`: {
						return new Response(`${getCfClientIP(request)}`, {
							status: 200,
							headers: {
								"Content-Type": "text/plain;charset=utf-8",
							}
						});
					}
					default:
						return new Response(await nginx(), {
							headers: {
								'Content-Type': 'text/html; charset=UTF-8',
							},
						});
				}
			} else {
				// get the string of /proxyip=${string}/
				var match = url.pathname.match(/\/proxyip=([\w.-]+)/i);
				if (match && match[1]) {
					proxyIP = match[1];
				}
				return await vlessOverWSHandler(request);
			}
		} catch (err) {
			/** @type {Error} */ let e = err;
			return new Response(e.toString());
		}
	},
};

async function handleVlSub(goodIps, userID, request, israw, reqSpeed) {
	const hostname = request.headers.get('Host');
	const newProxiesList = generateProxiesList(goodIps, userID, hostname, reqSpeed, 'v');

	let theSub = newProxiesList.join('');
	if (!israw) {
		theSub = btoa(theSub);
	}
	return new Response(`${theSub}`, {
		status: 200,
		headers: {
		"Content-Type": "text/plain;charset=utf-8",
		}
	});
}

async function handleClSub(goodIps, clash_template_url, userID, request, reqSpeed) {
	const templateResponse = await fetch(clash_template_url);
	const clashConfigTemplate = await templateResponse.text();
	const hostname = request.headers.get('Host');

	const { newProxiesList, newProxiesNameList, topBestSpeedIpList, proxyGroupCountryList } = generateProxiesList(goodIps, userID, hostname, reqSpeed, 'c');

	// 替换配置文件中的 {{topip[0]}} 占位符
	let updatedConfig = clashConfigTemplate.replace(
		/{{topip\[(\d+)\]}}/g,
		(match, index) => topBestSpeedIpList[index] // 使用 index 参数来获取匹配到的索引，并从 topBestSpeedIpList 中获取对应的 IP
	);

	//proxyGroupCountryList生成proxy_groups_country_name_list
	let proxy_groups_country_name_list = proxyGroupCountryList.map(proxyGroup => {
		return `- ${countryCodeEmoji(proxyGroup.country)}${proxyGroup.country}\n`;
	});

	//替换#      - {{proxy_groups_country_name_list}}
	updatedConfig = updatedConfig.replace(
		/^\s*#(\s*)- {{proxy_groups_country_name_list}}/gm,
		`$1${proxy_groups_country_name_list.join(`$1`)}`
	);

	// proxyGroupCountryList 生成 proxy_groups_list_by_country
	let proxy_groups_list_by_country = [];
	proxyGroupCountryList.forEach(proxyGroup => {
		proxy_groups_list_by_country.push(`- name: ${countryCodeEmoji(proxyGroup.country)}${proxyGroup.country}\n`);
		proxy_groups_list_by_country.push(`  type: load-balance\n`);
		proxy_groups_list_by_country.push(`  proxies:\n`);
		let proxies = proxyGroup.proxies;
		if (proxies && proxies.length) {
			proxies.forEach(proxy => {
				proxy_groups_list_by_country.push(`    - ${proxy}\n`);
			});
		}
	});

	//替换 #  - {{proxy_groups_list_by_country}}
	updatedConfig = updatedConfig.replace(
		/^\s*#(\s*)- {{proxy_groups_list_by_country}}/gm,
		`$1${proxy_groups_list_by_country.join(`$1`)}`
	);

	updatedConfig = updatedConfig.replace(
		/^\s*#(\s*)- {{proxies_list}}/gm,
		`$1${newProxiesList.join(`$1`)}`
	);
	updatedConfig = updatedConfig.replace(
		/^\s*#(\s*)- {{proxies_name_list}}/gm,
		`$1${newProxiesNameList.join(`$1`)}`
	);

	return new Response(updatedConfig, {
		headers: {
		'Content-Type': 'application/x-yaml',
		'Content-Disposition': 'attachment; filename="clash_config.yaml"'
		},
	});
}

function generateProxiesList(goodIps, userID, hostname, reqSpeed, type) {
    const newProxiesList = [];
    const newProxiesNameList = [];
    const bestSpeedIpList = [];
    const proto = atob(MPRO);

	//#      - {{proxy_groups_country_name_list}}
	const proxyGroupCountryList = [];

    goodIps.forEach(goodIP => {
        if (!goodIP.proxyIP || goodIP.proxyIP.length === 0) {
            return;
        }

		let proxyGroupCountry = {
			country: `${goodIP.country}`,
			proxies: []
		};
        let specProxyIp = goodIP.proxyIP[0];
        const cfIPCount = goodIP.cfIP ? goodIP.cfIP.length : 0;

        for (let i = 0; i < goodIP.proxyIP.length + cfIPCount; i++) {
            let thisProxyIp;
            let speed;

            if (i < goodIP.proxyIP.length) {
                if (goodIP.proxyIPSpeed && reqSpeed > goodIP.proxyIPSpeed[i]) {
                    continue;
                }
                thisProxyIp = goodIP.proxyIP[i];
                speed = goodIP.proxyIPSpeed? goodIP.proxyIPSpeed[i] : -1;
                specProxyIp = thisProxyIp;
            } else {
                if (goodIP.cfIPSpeed && reqSpeed > goodIP.cfIPSpeed[i - goodIP.proxyIP.length]) {
                    continue;
                }
                thisProxyIp = goodIP.cfIP[i - goodIP.proxyIP.length];
                speed = goodIP.cfIPSpeed? goodIP.cfIPSpeed[i - goodIP.proxyIP.length] : -1;
            }

            if (type === 'v') {
                newProxiesList.push(`${proto}://${userID}@${thisProxyIp}:443?encryption=none&security=tls&type=ws&host=${hostname}&sni=${hostname}&fp=random&path=%2Fproxyip%3D${specProxyIp}%2F%3Fed%3D2176#${countryCodeEmoji(goodIP.country)}${goodIP.country}${i}\n`);
            } else if (type === 'c') {
                newProxiesList.push(`- {"name":"${goodIP.country}${i}","type":"${proto}","server":"${thisProxyIp}","port":443,"uuid":"${userID}","tls":true,"servername":"${hostname}","network":"ws","ws-opts":{"path":"/proxyip=${specProxyIp}?ed=2176","headers":{"host":"${hostname}"}}}\n`);
                newProxiesNameList.push(`- ${goodIP.country}${i}\n`);
				proxyGroupCountry.proxies.push(`${goodIP.country}${i}`);
            }

            bestSpeedIpList.push({ ip: thisProxyIp, speed });
        }
		if (proxyGroupCountry.proxies.length > 0) {
			proxyGroupCountryList.push(proxyGroupCountry);
		}
    });

    if (type === 'v') {
        return newProxiesList;
    } else if (type === 'c') {
		bestSpeedIpList.sort((a, b) => b.speed - a.speed);
		const topBestSpeedIpList = bestSpeedIpList.map(item => item.ip);
        return { newProxiesList, newProxiesNameList, topBestSpeedIpList, proxyGroupCountryList };
    }
}

async function handleStoreRequest(request, env) {
	try {
	  // 解析请求体中的JSON
	  const goodIps = await request.json();

	  // 存储到指定KV键中
	  await env.GOODIP_KV.put("GOODIPS", JSON.stringify(goodIps));

	  // 返回一个响应
	  return new Response(JSON.stringify({ message: 'Data received and stored successfully', data: goodIps }), {
		headers: { 'Content-Type': 'application/json' }
	  });
	} catch (error) {
		return new Response(JSON.stringify({ error: 'Invalid JSON', details: error.message }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		  });
	}
  }


async function handleGetCountriesRequest(env) {
	try {
		let goodIps = [];
		//判定是否存有goodips KV
		const kv_goodips = await env.GOODIP_KV.get("GOODIPS");
		if (kv_goodips) {
			goodIps = JSON.parse(kv_goodips);
		} else {
			// 兼容旧版本，分散存储，获取所有键名，即所有国家
			const listResult = await env.GOODIP_KV.list();
			const countries = listResult.keys.map(key => key.name);

			// 获取所有GoodIp对象
			for (const country of countries) {
				const value = (country.length==2)? await env.GOODIP_KV.get(country):null;
				if (value) {
					goodIps.push(JSON.parse(value));
				}
			}
		}

		// 返回包含国家列表和GoodIp对象的响应
		return new Response(JSON.stringify(goodIps), {
		headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: 'Error fetching data from KV' }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' }
		});
	}
}

/**
 *
 * @param {import("@cloudflare/workers-types").Request} request
 */
async function vlessOverWSHandler(request) {

	/** @type {import("@cloudflare/workers-types").WebSocket[]} */
	// @ts-ignore
	const webSocketPair = new WebSocketPair();
	const [client, webSocket] = Object.values(webSocketPair);

	webSocket.accept();

	let address = '';
	let portWithRandomLog = '';
	const log = (/** @type {string} */ info, /** @type {string | undefined} */ event) => {
		console.log(`[${address}:${portWithRandomLog}] ${info}`, event || '');
	};
	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';

	const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

	/** @type {{ value: import("@cloudflare/workers-types").Socket | null}}*/
	let remoteSocketWapper = {
		value: null,
	};
	let udpStreamWrite = null;
	let isDns = false;

	// ws --> remote
	readableWebSocketStream.pipeTo(new WritableStream({
		async write(chunk, controller) {
			if (isDns && udpStreamWrite) {
				return udpStreamWrite(chunk);
			}
			if (remoteSocketWapper.value) {
				const writer = remoteSocketWapper.value.writable.getWriter()
				await writer.write(chunk);
				writer.releaseLock();
				return;
			}

			const {
				hasError,
				message,
				portRemote = 443,
				addressRemote = '',
				rawDataIndex,
				vlessVersion = new Uint8Array([0, 0]),
				isUDP,
			} = await processVlessHeader(chunk, userID);
			address = addressRemote;
			portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? 'udp ' : 'tcp '
				} `;
			if (hasError) {
				// controller.error(message);
				throw new Error(message); // cf seems has bug, controller.error will not end stream
				// webSocket.close(1000, message);
				return;
			}
			// if UDP but port not DNS port, close it
			if (isUDP) {
				if (portRemote === 53) {
					isDns = true;
				} else {
					// controller.error('UDP proxy only enable for DNS which is port 53');
					throw new Error('UDP proxy only enable for DNS which is port 53'); // cf seems has bug, controller.error will not end stream
					return;
				}
			}
			// ["version", "附加信息长度 N"]
			const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
			const rawClientData = chunk.slice(rawDataIndex);

			// TODO: support udp here when cf runtime has udp support
			if (isDns) {
				const { write } = await handleUDPOutBound(webSocket, vlessResponseHeader, log);
				udpStreamWrite = write;
				udpStreamWrite(rawClientData);
				return;
			}
			handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log);
		},
		close() {
			log(`readableWebSocketStream is close`);
		},
		abort(reason) {
			log(`readableWebSocketStream is abort`, JSON.stringify(reason));
		},
	})).catch((err) => {
		log('readableWebSocketStream pipeTo error', err);
	});

	return new Response(null, {
		status: 101,
		// @ts-ignore
		webSocket: client,
	});
}

/**
 * Checks if a given UUID is present in the API response.
 * @param {string} targetUuid The UUID to search for.
 * @returns {Promise<boolean>} A Promise that resolves to true if the UUID is present in the API response, false otherwise.
 */
async function checkUuidInApiResponse(targetUuid) {
	// Check if any of the environment variables are empty


	try {
		const apiResponse = await getApiResponse();
		if (!apiResponse) {
			return false;
		}
		const isUuidInResponse = apiResponse.users.some(user => user.uuid === targetUuid);
		return isUuidInResponse;
	} catch (error) {
		console.error('Error:', error);
		return false;
	}
}


/**
 * Handles outbound TCP connections.
 *
 * @param {any} remoteSocket
 * @param {string} addressRemote The remote address to connect to.
 * @param {number} portRemote The remote port to connect to.
 * @param {Uint8Array} rawClientData The raw client data to write.
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket The WebSocket to pass the remote socket to.
 * @param {Uint8Array} vlessResponseHeader The VLESS response header.
 * @param {function} log The logging function.
 * @returns {Promise<void>} The remote socket.
 */
async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log,) {
	async function connectAndWrite(address, port) {
		/** @type {import("@cloudflare/workers-types").Socket} */
		const tcpSocket = connect({
			hostname: address,
			port: port,
		});
		remoteSocket.value = tcpSocket;
		log(`connected to ${address}:${port}`);
		const writer = tcpSocket.writable.getWriter();
		await writer.write(rawClientData); // first write, nomal is tls client hello
		writer.releaseLock();
		return tcpSocket;
	}

	// if the cf connect tcp socket have no incoming data, we retry to redirect ip
	async function retry() {
		const tcpSocket = await connectAndWrite(proxyIP || addressRemote, portRemote)
		// no matter retry success or not, close websocket
		tcpSocket.closed.catch(error => {
			console.log('retry tcpSocket closed error', error);
		}).finally(() => {
			safeCloseWebSocket(webSocket);
		})
		remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
	}

	const tcpSocket = await connectAndWrite(addressRemote, portRemote);

	// when remoteSocket is ready, pass to websocket
	// remote--> ws
	remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
}

/**
 *
 * @param {import("@cloudflare/workers-types").WebSocket} webSocketServer
 * @param {string} earlyDataHeader for ws 0rtt
 * @param {(info: string)=> void} log for ws 0rtt
 */
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
	let readableStreamCancel = false;
	const stream = new ReadableStream({
		start(controller) {
			webSocketServer.addEventListener('message', (event) => {
				if (readableStreamCancel) {
					return;
				}
				const message = event.data;
				controller.enqueue(message);
			});

			// The event means that the client closed the client -> server stream.
			// However, the server -> client stream is still open until you call close() on the server side.
			// The WebSocket protocol says that a separate close message must be sent in each direction to fully close the socket.
			webSocketServer.addEventListener('close', () => {
				// client send close, need close server
				// if stream is cancel, skip controller.close
				safeCloseWebSocket(webSocketServer);
				if (readableStreamCancel) {
					return;
				}
				controller.close();
			}
			);
			webSocketServer.addEventListener('error', (err) => {
				log('webSocketServer has error');
				controller.error(err);
			}
			);
			// for ws 0rtt
			const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
			if (error) {
				controller.error(error);
			} else if (earlyData) {
				controller.enqueue(earlyData);
			}
		},

		pull(controller) {
			// if ws can stop read if stream is full, we can implement backpressure
			// https://streams.spec.whatwg.org/#example-rs-push-backpressure
		},
		cancel(reason) {
			// 1. pipe WritableStream has error, this cancel will called, so ws handle server close into here
			// 2. if readableStream is cancel, all controller.close/enqueue need skip,
			// 3. but from testing controller.error still work even if readableStream is cancel
			if (readableStreamCancel) {
				return;
			}
			log(`ReadableStream was canceled, due to ${reason}`)
			readableStreamCancel = true;
			safeCloseWebSocket(webSocketServer);
		}
	});

	return stream;

}

// https://xtls.github.io/development/protocols/v--l--e--s--s.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 *
 * @param { ArrayBuffer} vlessBuffer
 * @param {string} userID
 * @returns
 */
async function processVlessHeader(
	vlessBuffer,
	userID
) {
	if (vlessBuffer.byteLength < 24) {
		return {
			hasError: true,
			message: 'invalid data',
		};
	}
	const version = new Uint8Array(vlessBuffer.slice(0, 1));
	let isValidUser = false;
	let isUDP = false;
	const slicedBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
	const slicedBufferString = stringify(slicedBuffer);

	const uuids = userID.includes(',') ? userID.split(",") : [userID];

	const checkUuidInApi = await checkUuidInApiResponse(slicedBufferString);
	isValidUser = uuids.some(userUuid => checkUuidInApi || slicedBufferString === userUuid.trim());

	console.log(`checkUuidInApi: ${await checkUuidInApiResponse(slicedBufferString)}, userID: ${slicedBufferString}`);

	if (!isValidUser) {
		return {
			hasError: true,
			message: 'invalid user',
		};
	}

	const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
	//skip opt for now

	const command = new Uint8Array(
		vlessBuffer.slice(18 + optLength, 18 + optLength + 1)
	)[0];

	// 0x01 TCP
	// 0x02 UDP
	// 0x03 MUX
	if (command === 1) {
	} else if (command === 2) {
		isUDP = true;
	} else {
		return {
			hasError: true,
			message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`,
		};
	}
	const portIndex = 18 + optLength + 1;
	const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2);
	// port is big-Endian in raw data etc 80 == 0x005d
	const portRemote = new DataView(portBuffer).getUint16(0);

	let addressIndex = portIndex + 2;
	const addressBuffer = new Uint8Array(
		vlessBuffer.slice(addressIndex, addressIndex + 1)
	);

	// 1--> ipv4  addressLength =4
	// 2--> domain name addressLength=addressBuffer[1]
	// 3--> ipv6  addressLength =16
	const addressType = addressBuffer[0];
	let addressLength = 0;
	let addressValueIndex = addressIndex + 1;
	let addressValue = '';
	switch (addressType) {
		case 1:
			addressLength = 4;
			addressValue = new Uint8Array(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			).join('.');
			break;
		case 2:
			addressLength = new Uint8Array(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + 1)
			)[0];
			addressValueIndex += 1;
			addressValue = new TextDecoder().decode(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			);
			break;
		case 3:
			addressLength = 16;
			const dataView = new DataView(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			);
			// 2001:0db8:85a3:0000:0000:8a2e:0370:7334
			const ipv6 = [];
			for (let i = 0; i < 8; i++) {
				ipv6.push(dataView.getUint16(i * 2).toString(16));
			}
			addressValue = ipv6.join(':');
			// seems no need add [] for ipv6
			break;
		default:
			return {
				hasError: true,
				message: `invild  addressType is ${addressType}`,
			};
	}
	if (!addressValue) {
		return {
			hasError: true,
			message: `addressValue is empty, addressType is ${addressType}`,
		};
	}

	return {
		hasError: false,
		addressRemote: addressValue,
		addressType,
		portRemote,
		rawDataIndex: addressValueIndex + addressLength,
		vlessVersion: version,
		isUDP,
	};
}


/**
 *
 * @param {import("@cloudflare/workers-types").Socket} remoteSocket
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket
 * @param {ArrayBuffer} vlessResponseHeader
 * @param {(() => Promise<void>) | null} retry
 * @param {*} log
 */
async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
	// remote--> ws
	let remoteChunkCount = 0;
	let chunks = [];
	/** @type {ArrayBuffer | null} */
	let vlessHeader = vlessResponseHeader;
	let hasIncomingData = false; // check if remoteSocket has incoming data
	await remoteSocket.readable
		.pipeTo(
			new WritableStream({
				start() {
				},
				/**
				 *
				 * @param {Uint8Array} chunk
				 * @param {*} controller
				 */
				async write(chunk, controller) {
					hasIncomingData = true;
					// remoteChunkCount++;
					if (webSocket.readyState !== WS_READY_STATE_OPEN) {
						controller.error(
							'webSocket.readyState is not open, maybe close'
						);
					}
					if (vlessHeader) {
						webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
						vlessHeader = null;
					} else {
						// seems no need rate limit this, CF seems fix this??..
						// if (remoteChunkCount > 20000) {
						// 	// cf one package is 4096 byte(4kb),  4096 * 20000 = 80M
						// 	await delay(1);
						// }
						webSocket.send(chunk);
					}
				},
				close() {
					log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
					// safeCloseWebSocket(webSocket); // no need server close websocket frist for some case will casue HTTP ERR_CONTENT_LENGTH_MISMATCH issue, client will send close event anyway.
				},
				abort(reason) {
					console.error(`remoteConnection!.readable abort`, reason);
				},
			})
		)
		.catch((error) => {
			console.error(
				`remoteSocketToWS has exception `,
				error.stack || error
			);
			safeCloseWebSocket(webSocket);
		});

	// seems is cf connect socket have error,
	// 1. Socket.closed will have error
	// 2. Socket.readable will be close without any data coming
	if (hasIncomingData === false && retry) {
		log(`retry`)
		retry();
	}
}

/**
 *
 * @param {string} base64Str
 * @returns
 */
function base64ToArrayBuffer(base64Str) {
	if (!base64Str) {
		return { error: null };
	}
	try {
		// go use modified Base64 for URL rfc4648 which js atob not support
		base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
		const decode = atob(base64Str);
		const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
		return { earlyData: arryBuffer.buffer, error: null };
	} catch (error) {
		return { error };
	}
}

/**
 * This is not real UUID validation
 * @param {string} uuid
 */
function isValidUUID(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
/**
 * Normally, WebSocket will not has exceptions when close.
 * @param {import("@cloudflare/workers-types").WebSocket} socket
 */
function safeCloseWebSocket(socket) {
	try {
		if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
			socket.close();
		}
	} catch (error) {
		console.error('safeCloseWebSocket error', error);
	}
}

const byteToHex = [];
for (let i = 0; i < 256; ++i) {
	byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
	return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
function stringify(arr, offset = 0) {
	const uuid = unsafeStringify(arr, offset);
	if (!isValidUUID(uuid)) {
		throw TypeError("Stringified UUID is invalid");
	}
	return uuid;
}


/**
 *
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket
 * @param {ArrayBuffer} vlessResponseHeader
 * @param {(string)=> void} log
 */
async function handleUDPOutBound(webSocket, vlessResponseHeader, log) {

	let isVlessHeaderSent = false;
	const transformStream = new TransformStream({
		start(controller) {

		},
		transform(chunk, controller) {
			// udp message 2 byte is the the length of udp data
			// TODO: this should have bug, beacsue maybe udp chunk can be in two websocket message
			for (let index = 0; index < chunk.byteLength;) {
				const lengthBuffer = chunk.slice(index, index + 2);
				const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
				const udpData = new Uint8Array(
					chunk.slice(index + 2, index + 2 + udpPakcetLength)
				);
				index = index + 2 + udpPakcetLength;
				controller.enqueue(udpData);
			}
		},
		flush(controller) {
		}
	});

	// only handle dns udp for now
	transformStream.readable.pipeTo(new WritableStream({
		async write(chunk) {
			const resp = await fetch(dohURL, // dns server url
				{
					method: 'POST',
					headers: {
						'content-type': 'application/dns-message',
					},
					body: chunk,
				})
			const dnsQueryResult = await resp.arrayBuffer();
			const udpSize = dnsQueryResult.byteLength;
			// console.log([...new Uint8Array(dnsQueryResult)].map((x) => x.toString(16)));
			const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
			if (webSocket.readyState === WS_READY_STATE_OPEN) {
				log(`doh success and dns message length is ${udpSize}`);
				if (isVlessHeaderSent) {
					webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
				} else {
					webSocket.send(await new Blob([vlessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
					isVlessHeaderSent = true;
				}
			}
		}
	})).catch((error) => {
		log('dns udp has error' + error)
	});

	const writer = transformStream.writable.getWriter();

	return {
		/**
		 *
		 * @param {Uint8Array} chunk
		 */
		write(chunk) {
			writer.write(chunk);
		}
	};
}

function getCfClientIP(request) {
	const ip = request.headers.get('CF-Connecting-IP');
	if (ip) {
		return ip;
	} else if (request.cf && request.cf.clientIP) {
		return request.cf.clientIP;
	} else {
		return request.headers.get('X-Forwarded-For') || request.headers.get('X-Real-IP') || request.connection.socket.remoteAddress;
	}
}

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>

	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>

	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text ;
}


/**
 * convert country code to corresponding flag emoji
 * @param {string} cc - country code string
 * @returns {string} flag emoji
 */
function countryCodeEmoji(cc) {
	// country code regex
	const CC_REGEX = /^[a-z]{2}$/i;
	// offset between uppercase ascii and regional indicator symbols
	const OFFSET = 127397;
	if (!CC_REGEX.test(cc)) {
	return '';
	}

	const codePoints = [...cc.toUpperCase()].map(c => c.codePointAt() + OFFSET);
	return String.fromCodePoint(...codePoints);
}
