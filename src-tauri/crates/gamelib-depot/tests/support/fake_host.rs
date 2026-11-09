//! `JobHost` double: records emits, token requests and request-code requests, and answers from
//! scripted queues (the last answer is sticky).

use gamelib_depot::{JobEvent, JobHost, TokenRequest};
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Default)]
pub struct FakeHost {
    pub emits: Mutex<Vec<JobEvent>>,
    pub token_calls: Mutex<Vec<TokenRequest>>,
    pub code_calls: Mutex<Vec<(String, String, String)>>,
    token_answers: Mutex<VecDeque<Result<Option<String>, String>>>,
    code_answers: Mutex<VecDeque<Result<Option<String>, String>>>,
}

fn next<T: Clone>(q: &Mutex<VecDeque<T>>, empty: T) -> T {
    let mut q = q.lock().unwrap();
    if q.len() > 1 {
        q.pop_front().unwrap()
    } else {
        q.front().cloned().unwrap_or(empty)
    }
}

impl FakeHost {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_tokens(self, answers: Vec<Result<Option<String>, String>>) -> Self {
        *self.token_answers.lock().unwrap() = answers.into();
        self
    }

    pub fn with_codes(self, answers: Vec<Result<Option<String>, String>>) -> Self {
        *self.code_answers.lock().unwrap() = answers.into();
        self
    }

    pub fn forces(&self) -> Vec<bool> {
        self.token_calls.lock().unwrap().iter().map(|r| r.force).collect()
    }
}

impl JobHost for FakeHost {
    fn emit(&self, ev: JobEvent) {
        self.emits.lock().unwrap().push(ev);
    }

    fn cdn_token(&self, req: TokenRequest) -> Result<Option<String>, String> {
        self.token_calls.lock().unwrap().push(req);
        next(&self.token_answers, Ok(None))
    }

    fn manifest_request_code(
        &self,
        app_id: &str,
        depot_id: &str,
        manifest_id: &str,
    ) -> Result<Option<String>, String> {
        self.code_calls
            .lock()
            .unwrap()
            .push((app_id.into(), depot_id.into(), manifest_id.into()));
        next(&self.code_answers, Ok(None))
    }
}
