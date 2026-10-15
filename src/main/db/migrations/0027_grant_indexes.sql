CREATE INDEX IF NOT EXISTS grants_installation_lookup ON company_grants_records(company_id, kind, json_extract(data,'$.workOrderReference'), json_extract(data,'$.scheme'));
CREATE INDEX IF NOT EXISTS grants_application_lookup ON company_grants_records(company_id, kind, json_extract(data,'$.applicationReference'), json_extract(data,'$.scheme'), json_extract(data,'$.beneficiary'));
CREATE INDEX IF NOT EXISTS grants_documents_updated ON company_grants_records(company_id, kind, updated_at);
