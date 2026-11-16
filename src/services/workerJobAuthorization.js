import { ethers } from 'ethers';
import { verifyOfferPayment } from './agentServiceOffer.js';
import { verifyJobPacket, jobPacketSender } from './smartAgentHandoff.js';
import { sameAddress } from './agentWorkerProtocol.js';

export function verifyAcceptedWorkerJob(packet, live, { caller, grant, identity, call, escrow, now = Date.now() }) {
  verifyJobPacket(packet, live, { chainId: grant.chainId, escrow });
  if (!sameAddress(jobPacketSender(packet), live.employer)
    || (!sameAddress(live.employer, caller) && !sameAddress(packet.terms.executionCaller, caller))
    || !grant.peerId || packet.terms.executionPeer !== grant.peerId
    || live.status !== 2 || live.deliverBy * 1000 <= now
    || String(live.companionTokenId) !== String(grant.tokenId) || !sameAddress(live.currency, identity.token)
    || (!sameAddress(live.worker, identity.wallet) && !sameAddress(live.worker, identity.owner))) throw new Error('Accepted job does not authorize this caller and worker.');
  const executionHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ capability: call.capability, input: call.input })));
  if (packet.terms.executionHash !== executionHash) throw new Error('Execution inputs do not match the funded job.');
  if (grant.offer) verifyOfferPayment(grant.offer, packet.terms);
  else if (packet.terms.serviceOffer) throw new Error('This provider no longer offers the funded asset package.');
  return true;
}
