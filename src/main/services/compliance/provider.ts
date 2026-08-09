import type { ComplianceProvider } from './ComplianceProvider'
import { StubComplianceProvider } from './stub/StubComplianceProvider'

/** Single swap point: replace with a real ComplianceProvider once the deficiency-chatbot
 *  backend is ready. Nothing outside this file needs to change. */
export const complianceProvider: ComplianceProvider = new StubComplianceProvider()
