use rhai::FnPtr;
use std::collections::HashMap;
use std::fmt;

/// A stored handler closure extracted from a UI element.
/// Button handlers take `(state)`, PieceSelection handlers take `(state, piece)`.
#[derive(Clone)]
pub enum StoredHandler {
    /// Button handler: fn(state) -> #{}
    Button { closure: FnPtr },
    /// PieceSelection handler: fn(state, Piece) -> #{}
    PieceSelection { closure: FnPtr },
}

impl fmt::Debug for StoredHandler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Button { .. } => write!(f, "Button(handler)"),
            Self::PieceSelection { .. } => write!(f, "PieceSelection(handler)"),
        }
    }
}

/// Maps UI element IDs to their handler closures.
/// Completely replaced after every `get_ui` call.
#[derive(Debug)]
pub struct HandlerRegistry {
    handlers: HashMap<String, StoredHandler>,
}

impl HandlerRegistry {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    /// Remove all stored handlers. Called before `get_ui`.
    pub fn clear(&mut self) {
        self.handlers.clear();
    }

    /// Store a handler for the given element ID.
    pub fn insert(&mut self, id: String, handler: StoredHandler) {
        self.handlers.insert(id, handler);
    }

    /// Look up and clone a handler by element ID.
    pub fn get_clone(&self, id: &str) -> Option<StoredHandler> {
        self.handlers.get(id).cloned()
    }
}