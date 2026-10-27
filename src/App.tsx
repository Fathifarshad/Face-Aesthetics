import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ClientHome } from './features/client/ClientHome';
import { ClientRecord } from './features/client/ClientRecord';
import { InspectorPage } from './features/dev/InspectorPage';
import { AgePage } from './features/doctor/AgePage';
import { AnalysisPage } from './features/doctor/AnalysisPage';
import { CapturePage } from './features/doctor/CapturePage';
import { ComparePage } from './features/doctor/ComparePage';
import { IntakePage } from './features/doctor/IntakePage';
import { MdCodesPage } from './features/doctor/MdCodesPage';
import { NewCasePage } from './features/doctor/NewCasePage';
import { PatientPage } from './features/doctor/PatientPage';
import { PatientsPage } from './features/doctor/PatientsPage';
import { PlanPage } from './features/doctor/PlanPage';
import { PrintPage } from './features/doctor/PrintPage';
import { ReportPage } from './features/doctor/ReportPage';
import { EmergencyPage } from './features/EmergencyPage';
import { HomePage } from './features/HomePage';
import { SettingsPage } from './features/SettingsPage';
import { useDocumentLang } from './i18n';

export function App() {
  useDocumentLang();
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/doctor" element={<PatientsPage />} />
        <Route path="/doctor/new" element={<NewCasePage />} />
        <Route path="/doctor/patient/:patientId" element={<PatientPage />} />
        <Route path="/doctor/case/:caseId/intake" element={<IntakePage />} />
        <Route path="/doctor/case/:caseId/capture" element={<CapturePage />} />
        <Route path="/doctor/case/:caseId/analysis" element={<AnalysisPage />} />
        <Route path="/doctor/case/:caseId/age" element={<AgePage />} />
        <Route path="/doctor/case/:caseId/plan" element={<PlanPage />} />
        <Route path="/doctor/case/:caseId/mdcodes" element={<MdCodesPage />} />
        <Route path="/doctor/case/:caseId/report" element={<ReportPage />} />
        <Route path="/doctor/case/:caseId/print" element={<PrintPage />} />
        <Route path="/doctor/case/:caseId/compare" element={<ComparePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/dev/inspector" element={<InspectorPage />} />
        <Route path="/client" element={<ClientHome />} />
        <Route path="/client/:code" element={<ClientRecord />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
