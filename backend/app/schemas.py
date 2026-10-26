from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    """Регистрация в демо: без почты и SMS, подтверждение имитируется на экране."""
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=100)
    role: Literal["client"] = "client"


class DemoIn(BaseModel):
    model_config = {"extra": "forbid"}


class AskIn(BaseModel):
    text: str = Field(default="", max_length=500)


class RecommendIn(BaseModel):
    text: str = Field(max_length=1000)
    amount: int | None = None


class CalcIn(BaseModel):
    product_code: str
    amount: int = Field(gt=0, le=150_000_000)
    term_months: int = Field(gt=0, le=120)
    has_collateral: bool = False


class Financials(BaseModel):
    revenue_year: int | None = Field(default=None, ge=0, le=10**11)
    net_profit_year: int | None = Field(default=None, ge=-10**11, le=10**11)
    monthly_turnover: int | None = Field(default=None, ge=0, le=10**10)
    monthly_obligations: int | None = Field(default=None, ge=0, le=10**10)


class Contact(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    role: str | None = Field(default=None, max_length=60)  # owner | director | accountant | employee


class ApplicationIn(BaseModel):
    company_inn: str
    product_code: str
    amount: int = Field(gt=0, le=150_000_000)
    term_months: int = Field(gt=0, le=120)
    purpose: str | None = Field(default=None, max_length=1000)
    has_collateral: bool = False
    collateral_note: str | None = Field(default=None, max_length=300)
    financials: Financials = Financials()
    contact: Contact = Contact()


class ApplicationPatch(BaseModel):
    company_inn: str | None = None
    product_code: str | None = None
    amount: int | None = Field(default=None, gt=0, le=150_000_000)
    term_months: int | None = Field(default=None, gt=0, le=120)
    purpose: str | None = Field(default=None, max_length=1000)
    has_collateral: bool | None = None
    collateral_note: str | None = Field(default=None, max_length=300)
    financials: Financials | None = None
    contact: Contact | None = None
    wizard_step: int | None = Field(default=None, ge=1, le=5)

    @model_validator(mode="after")
    def reject_null_required(self):
        for key in ("product_code", "amount", "term_months", "has_collateral", "wizard_step"):
            if key in self.model_fields_set and getattr(self, key) is None:
                raise ValueError(f"{key} не может быть пустым")
        return self


class AnswerIn(BaseModel):
    answer: str | None = Field(default=None, max_length=2000)
    fields: dict[str, str | int | float | None] = {}


class SignIn(BaseModel):
    consent: bool


class DeclineIn(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class DocReviewIn(BaseModel):
    status: Literal["verified", "rejected"]
    comment: str | None = Field(default=None, max_length=300)


class InfoItemIn(BaseModel):
    type: Literal["field", "document", "text"]
    key: str | None = None
    label: str


class RequestInfoIn(BaseModel):
    message: str = Field(min_length=3, max_length=1000)
    items: list[InfoItemIn] = []


class DecisionIn(BaseModel):
    type: Literal["approve", "counter", "reject"]
    amount: int | None = None
    term_months: int | None = None
    rate: float | None = Field(default=None, ge=0, le=60)
    reason_code: str | None = None
    comment: str | None = Field(default=None, max_length=1000)


class ExtractionPatch(BaseModel):
    value: int | None = Field(default=None, ge=-10**11, le=10**11)
    confirm: bool = False
    comment: str | None = Field(default=None, max_length=300)


class DraftIn(BaseModel):
    product_code: str
    amount: int | None = Field(default=None, gt=0, le=150_000_000)
    term_months: int | None = Field(default=None, gt=0, le=120)
