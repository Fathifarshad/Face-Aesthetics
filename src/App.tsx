import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { DoctorShell } from './app/DoctorShell';
import { VaultGate } from './app/VaultGate';
import { AdminPage } from './features/admin/AdminPage';
import { ClientHome } from './features/client/ClientHome';
import { ClientRecord } from './features/client/ClientRecord';
import { InspectorPage } from './features/dev/InspectorPage';
import { RegionsDebugPage } from './features/dev/RegionsDebugPage';
import { AnalysisPage } from './features/doctor/AnalysisPage';
import { CapturePage } from './features/doctor/CapturePage';
import { ComparePage } from './features/doctor/ComparePage';
import { GradingPage } from './features/doctor/GradingPage';
import { IntakePage } from './features/doctor/IntakePage';
import { ConsentPage } from './features/doctor/ConsentPanel';
import { MdCodesPage } from './features/doctor/MdCodesPage';
import { NewCasePage } from './features/doctor/NewCasePage';
import { PatientPage } from './features/doctor/PatientPage';
import { PatientsPage } from './features/doctor/PatientsPage';
import { PlanPage } from './features/doctor/PlanPage';
import { PrintPage } from './features/doctor/PrintPage';
import { ReportPage } from './features/doctor/ReportPage';
import { GalleryPage } from './features/doctor/GalleryPage';
import { NoCasePage } from './features/doctor/SectionPlaceholders';
import { SimulatePage } from './features/doctor/SimulatePage';
import { EmergencyPage } from './features/EmergencyPage';
import { HomePage } from './features/HomePage';
import { useDocumentLang } from './i18n';

export function App() {
  useDocumentLang();
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Everything that shows patient data sits behind the vault: passphrase, lock, auto-lock. */}
        <Route element={<VaultGate />}>
          {/* Doctor app frame: five sections (cases, capture, simulate, plan, before/after) */}
          <Route element={<DoctorShell />}>
            <Route path="/doctor" element={<PatientsPage />} />
            <Route path="/doctor/new" element={<NewCasePage />} />
            <Route path="/doctor/patient/:patientId" element={<PatientPage />} />
            <Route path="/doctor/patient/:patientId/consent" element={<ConsentPage />} />
            <Route path="/doctor/no-case/:section" element={<NoCasePage />} />
            <Route path="/doctor/case/:caseId/intake" element={<IntakePage />} />
            <Route path="/doctor/case/:caseId/capture" element={<CapturePage />} />
            <Route path="/doctor/case/:caseId/analysis" element={<AnalysisPage />} />
            <Route path="/doctor/case/:caseId/grading" element={<GradingPage />} />
            <Route path="/doctor/case/:caseId/age" element={<AgeRedirect />} />
            <Route path="/doctor/case/:caseId/simulate" element={<SimulatePage />} />
            <Route path="/doctor/case/:caseId/plan" element={<PlanPage />} />
            <Route path="/doctor/case/:caseId/mdcodes" element={<MdCodesPage />} />
            <Route path="/doctor/case/:caseId/report" element={<ReportPage />} />
            <Route path="/doctor/case/:caseId/gallery" element={<GalleryPage />} />
            <Route path="/doctor/case/:caseId/compare" element={<ComparePage />} />
          </Route>
          <Route path="/doctor/case/:caseId/print" element={<PrintPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="/settings" element={<Navigate to="/admin" replace />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/dev/inspector" element={<InspectorPage />} />
        <Route path="/dev/regions" element={<RegionsDebugPage />} />
        <Route path="/client" element={<ClientHome />} />
        <Route path="/client/:code" element={<ClientRecord />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

/** The v1 target-age page was replaced by grading + the age target on the simulation page (M5). */
function AgeRedirect() {
  const { caseId = '' } = useParams();
  return <Navigate to={`/doctor/case/${caseId}/grading`} replace />;
}
